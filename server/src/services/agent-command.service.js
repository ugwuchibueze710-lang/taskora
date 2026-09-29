import { query } from '../lib/db.js';
import { chatCompletion, groqConfigured } from './groq.service.js';
import { notify } from './notification.service.js';
import { logAdminAction } from './audit.service.js';
import { createAgencyItem, resolveOpenEscalationsForUser } from './agency.service.js';

// ---------------------------------------------------------------------------
// The admin "command box" -- the free-text control the admin dashboard's
// Agency tab exposes so an admin can type an instruction ("suspend the user
// john@x.com", "how many open disputes are there", "reply to the last
// message from Maria saying we'll look into it") and have it actually
// happen, instead of clicking through the matching page by hand.
//
// Design, confirmed with the admin over three explicit questions before any
// of this was built:
//   1. Only this command box can trigger an action -- never anything typed
//      by a customer (support messages only ever get read-only, FAQ-style
//      auto-replies; see support-agent.service.js). That keeps the whole
//      "the AI can do anything an admin can" surface behind an admin login,
//      not reachable by a stranger typing into a support box.
//   2. Anything risky (suspends, deletes, promotes to admin, refunds,
//      resolves a dispute, hides a review) is never executed straight from
//      here -- it's queued as an ordinary agency_item with a proposed_action,
//      exactly like the existing "Needs your approval" flow, so one real
//      admin click is still required before money moves or an account is
///     touched. Read-only lookups and reversible, non-destructive actions
//      (replying to support, verifying/reactivating something) run
//      immediately.
//   3. Every tool call hits the real database -- the model is never asked to
//      guess a number or an account's state; it's given tools to look
//      things up and told to use them.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Agency, Taskora's admin operations assistant. You are talking
directly to a logged-in Taskora admin through their dashboard's command box, not to a
customer. Taskora is a local-services marketplace (customers hire providers for jobs).

You can do essentially anything the admin could do by clicking through the dashboard
themselves: look up users, providers, jobs, payments, disputes, reviews and support
threads; reply to a customer's support thread; verify or reactivate an account; and
suspend, delete, promote, refund, or resolve a dispute (those last ones are queued for
one quick admin approval rather than run instantly -- tell the admin that plainly when
it happens, they'll see it under "Needs your approval").

Rules:
- Always use your tools to look up real data before answering anything about a specific
  account, job, payment, dispute, or number. Never invent or guess a name, id, balance,
  or status.
- If a name or description could match more than one account, call the relevant search
  tool and, if there's more than one plausible match (or none), ask the admin a specific
  question naming the candidates you found rather than guessing which one they meant.
- Never respond with "I don't understand" or similar with nothing else -- if a request is
  ambiguous or you're missing a detail, ask exactly what you need to proceed. If a request
  is simply outside what any tool here can do, say plainly what you can't do and why.
- Keep replies short and concrete: what you found, or what you just did / queued, in plain
  language an admin can scan in a few seconds.
- Money and account-status changes are serious -- when a tool result says an action was
  queued for approval, say so; never claim you already suspended/deleted/refunded/promoted
  something when the tool told you it was only queued.`;

function truncate(str, n = 2000) {
  if (!str) return str;
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// ---- Read tools -----------------------------------------------------------

async function searchUsers({ query: q }) {
  const { rows } = await query(
    `SELECT id, first_name, last_name, email, role, status, current_mode, created_at
       FROM users WHERE lower(first_name || ' ' || last_name || ' ' || email) LIKE $1
      ORDER BY created_at DESC LIMIT 15`,
    [`%${q.toLowerCase()}%`]
  );
  return rows;
}

async function getUserDetail({ userId }) {
  const { rows } = await query(
    `SELECT id, first_name, last_name, email, role, status, current_mode, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) return { error: 'No user with that id.' };
  const user = rows[0];
  const { rows: providerRows } = await query('SELECT * FROM providers WHERE user_id = $1', [userId]);
  const provider = providerRows[0] || null;
  const { rows: jobsAsCustomer } = await query(
    `SELECT id, status, service_description, created_at FROM jobs WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  return { user, provider, recentJobsAsCustomer: jobsAsCustomer };
}

async function searchProviders({ query: q }) {
  const { rows } = await query(
    `SELECT p.id, p.business_name, p.display_name, p.status, p.verified, u.email, u.id AS user_id
       FROM providers p JOIN users u ON u.id = p.user_id
      WHERE lower(coalesce(p.business_name,'') || ' ' || coalesce(p.display_name,'')) LIKE $1
      ORDER BY p.created_at DESC LIMIT 15`,
    [`%${q.toLowerCase()}%`]
  );
  return rows;
}

async function getProviderDetail({ providerId }) {
  const { rows } = await query(
    `SELECT p.*, u.email, u.first_name, u.last_name FROM providers p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [providerId]
  );
  if (!rows[0]) return { error: 'No provider with that id.' };
  const { rows: jobs } = await query(
    `SELECT id, status, service_description, created_at FROM jobs WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [providerId]
  );
  return { provider: rows[0], recentJobs: jobs };
}

async function listDisputes({ status }) {
  const { rows } = await query(
    `SELECT d.id, d.status, d.reason, d.description, d.job_id, d.created_at,
            ru.email AS reporter_email
       FROM disputes d JOIN users ru ON ru.id = d.raised_by_user_id
      ${status ? 'WHERE d.status = $1' : ''}
      ORDER BY d.created_at DESC LIMIT 25`,
    status ? [status] : []
  );
  return rows;
}

async function getDispute({ disputeId }) {
  const { rows } = await query('SELECT * FROM disputes WHERE id = $1', [disputeId]);
  return rows[0] || { error: 'No dispute with that id.' };
}

async function listJobs({ status, limit }) {
  const { rows } = await query(
    `SELECT j.id, j.status, j.service_description, j.created_at, cu.email AS customer_email,
            COALESCE(NULLIF(pr.business_name,''), pr.display_name) AS provider_name
       FROM jobs j JOIN users cu ON cu.id = j.customer_id JOIN providers pr ON pr.id = j.provider_id
      ${status ? 'WHERE j.status = $1' : ''}
      ORDER BY j.created_at DESC LIMIT $${status ? 2 : 1}`,
    status ? [status, Math.min(limit || 25, 50)] : [Math.min(limit || 25, 50)]
  );
  return rows;
}

async function getJob({ jobId }) {
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (!rows[0]) return { error: 'No job with that id.' };
  const { rows: payments } = await query('SELECT * FROM payments WHERE job_id = $1', [jobId]);
  return { job: rows[0], payment: payments[0] || null };
}

async function listReviews({ onlyHidden }) {
  const { rows } = await query(
    `SELECT id, job_id, customer_id, provider_id, rating, comment, is_flagged, is_hidden, created_at
       FROM reviews ${onlyHidden ? 'WHERE is_hidden = true' : ''} ORDER BY created_at DESC LIMIT 25`
  );
  return rows;
}

async function listSupportThreads({ onlyUnresolved }) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.first_name, u.last_name, u.email,
            (SELECT body FROM support_messages sm2 WHERE sm2.user_id = u.id ORDER BY sm2.created_at DESC LIMIT 1) AS last_message,
            (SELECT sender FROM support_messages sm3 WHERE sm3.user_id = u.id ORDER BY sm3.created_at DESC LIMIT 1) AS last_sender,
            (SELECT created_at FROM support_messages sm4 WHERE sm4.user_id = u.id ORDER BY sm4.created_at DESC LIMIT 1) AS last_message_at
       FROM users u
      WHERE EXISTS (SELECT 1 FROM support_messages sm WHERE sm.user_id = u.id)
      ORDER BY last_message_at DESC LIMIT 30`
  );
  const filtered = onlyUnresolved ? rows.filter((r) => r.last_sender === 'user') : rows;
  return filtered;
}

async function getSupportThread({ userId }) {
  const { rows } = await query('SELECT sender, body, created_at FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
  return rows;
}

async function getPlatformOverview() {
  const { rows } = await query(`
    SELECT
      (SELECT count(*) FROM users WHERE status = 'active') AS active_users,
      (SELECT count(*) FROM providers WHERE status = 'active') AS active_providers,
      (SELECT count(*) FROM jobs) AS total_jobs,
      (SELECT count(*) FROM disputes WHERE status NOT LIKE 'resolved%' AND status <> 'closed') AS open_disputes,
      (SELECT count(*) FROM support_messages sm WHERE sender = 'user'
         AND NOT EXISTS (SELECT 1 FROM support_messages sm2 WHERE sm2.user_id = sm.user_id AND sm2.created_at > sm.created_at)) AS unanswered_support_threads
  `);
  return rows[0];
}

// ---- Safe write tools (run immediately) ------------------------------------

async function replyToSupport({ userId, message }, ctx) {
  const { rows: userRows } = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!userRows[0]) return { error: 'No user with that id.' };
  const { rows } = await query(`INSERT INTO support_messages (user_id, sender, body) VALUES ($1, 'admin', $2) RETURNING id`, [userId, message]);
  await notify(userId, { type: 'support_reply', title: 'Taskora Support replied', body: message.slice(0, 140), data: {} });
  await logAdminAction({ adminUserId: ctx.adminUser.id, actionType: 'agent_command:support_reply', targetType: 'user', targetId: userId, details: { messageId: rows[0].id } });
  await resolveOpenEscalationsForUser(userId, ctx.adminUser.id);
  return { success: true, sent: message };
}

async function verifyProvider({ providerId }, ctx) {
  const { rows } = await query('UPDATE providers SET verified = true, updated_at = now() WHERE id = $1 RETURNING id', [providerId]);
  if (!rows[0]) return { error: 'No provider with that id.' };
  await logAdminAction({ adminUserId: ctx.adminUser.id, actionType: 'agent_command:verify_provider', targetType: 'provider', targetId: providerId });
  return { success: true };
}

async function reactivateUser({ userId }, ctx) {
  const { rows } = await query(`UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [userId]);
  if (!rows[0]) return { error: 'No user with that id.' };
  await logAdminAction({ adminUserId: ctx.adminUser.id, actionType: 'agent_command:reactivate_user', targetType: 'user', targetId: userId });
  return { success: true };
}

async function reactivateProvider({ providerId }, ctx) {
  const { rows } = await query(`UPDATE providers SET status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [providerId]);
  if (!rows[0]) return { error: 'No provider with that id.' };
  await logAdminAction({ adminUserId: ctx.adminUser.id, actionType: 'agent_command:reactivate_provider', targetType: 'provider', targetId: providerId });
  return { success: true };
}

// ---- Risky tools (queued for one-click approval, never run immediately) ---

async function queueRiskyAction({ actionType, targetType, targetId, proposedAction, title, summary, relatedUserId }, ctx) {
  const item = await createAgencyItem({
    kind: 'admin_command_action',
    severity: 'warning',
    title,
    summary,
    detail: { requestedBy: ctx.adminUser.email, command: ctx.commandText },
    relatedUserId: relatedUserId || null,
    proposedAction: { actionType, targetType, targetId, ...proposedAction },
  });
  return { queued: true, agencyItemId: item.id, note: 'Queued for one-click admin approval under "Needs your approval" in the Agency tab -- not yet applied.' };
}

async function suspendUser({ userId, reason }, ctx) {
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return { error: 'No user with that id.' };
  return queueRiskyAction(
    {
      actionType: 'suspend_user',
      targetType: 'user',
      targetId: userId,
      proposedAction: { reason },
      title: `Suspend user ${rows[0].email}`,
      summary: reason || 'Requested via Agency command.',
      relatedUserId: userId,
    },
    ctx
  );
}

async function suspendProvider({ providerId, reason }, ctx) {
  const { rows } = await query('SELECT p.id, u.email, u.id AS user_id FROM providers p JOIN users u ON u.id = p.user_id WHERE p.id = $1', [providerId]);
  if (!rows[0]) return { error: 'No provider with that id.' };
  return queueRiskyAction(
    {
      actionType: 'suspend_provider',
      targetType: 'provider',
      targetId: providerId,
      proposedAction: { reason },
      title: `Suspend provider ${rows[0].email}`,
      summary: reason || 'Requested via Agency command.',
      relatedUserId: rows[0].user_id,
    },
    ctx
  );
}

async function deleteUser({ userId, reason }, ctx) {
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return { error: 'No user with that id.' };
  return queueRiskyAction(
    {
      actionType: 'delete_user',
      targetType: 'user',
      targetId: userId,
      proposedAction: { reason },
      title: `Delete account ${rows[0].email}`,
      summary: reason || 'Requested via Agency command.',
      relatedUserId: userId,
    },
    ctx
  );
}

async function promoteUserToAdmin({ userId }, ctx) {
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return { error: 'No user with that id.' };
  return queueRiskyAction(
    {
      actionType: 'promote_user_to_admin',
      targetType: 'user',
      targetId: userId,
      proposedAction: {},
      title: `Promote ${rows[0].email} to admin`,
      summary: 'Requested via Agency command. Grants full, equal admin access.',
      relatedUserId: userId,
    },
    ctx
  );
}

async function refundJob({ jobId, reason }, ctx) {
  const { rows } = await query('SELECT id, customer_id FROM jobs WHERE id = $1', [jobId]);
  if (!rows[0]) return { error: 'No job with that id.' };
  return queueRiskyAction(
    {
      actionType: 'refund_job',
      targetType: 'job',
      targetId: jobId,
      proposedAction: { reason },
      title: `Refund job ${jobId}`,
      summary: reason || 'Requested via Agency command.',
      relatedUserId: rows[0].customer_id,
    },
    ctx
  );
}

async function resolveDispute({ disputeId, resolution, notes }, ctx) {
  const { rows } = await query('SELECT id, raised_by_user_id, status FROM disputes WHERE id = $1', [disputeId]);
  if (!rows[0]) return { error: 'No dispute with that id.' };
  if (rows[0].status.startsWith('resolved') || rows[0].status === 'closed') return { error: 'This dispute is already resolved.' };
  return queueRiskyAction(
    {
      actionType: 'resolve_dispute',
      targetType: 'dispute',
      targetId: disputeId,
      proposedAction: { resolution, notes },
      title: `Resolve dispute ${disputeId} (${resolution})`,
      summary: notes || 'Requested via Agency command.',
      relatedUserId: rows[0].raised_by_user_id,
    },
    ctx
  );
}

async function hideReview({ reviewId, reason }, ctx) {
  const { rows } = await query('SELECT id, customer_id FROM reviews WHERE id = $1', [reviewId]);
  if (!rows[0]) return { error: 'No review with that id.' };
  return queueRiskyAction(
    {
      actionType: 'hide_review',
      targetType: 'review',
      targetId: reviewId,
      proposedAction: {},
      title: `Hide review ${reviewId}`,
      summary: reason || 'Requested via Agency command.',
      relatedUserId: rows[0].customer_id,
    },
    ctx
  );
}

// ---- Tool registry ---------------------------------------------------------
// `spec` is the OpenAI/Groq function-calling schema; `handler` actually runs
// it. Handlers for tools that need the requesting admin (writes) take
// (args, ctx); pure lookups only take (args) but are called the same way.

const TOOLS = [
  { spec: { name: 'search_users', description: 'Search users by name or email substring.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }, handler: searchUsers },
  { spec: { name: 'get_user_detail', description: 'Full detail on one user by id: profile, provider record if any, recent jobs.', parameters: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] } }, handler: getUserDetail },
  { spec: { name: 'search_providers', description: 'Search providers by business or display name substring.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }, handler: searchProviders },
  { spec: { name: 'get_provider_detail', description: 'Full detail on one provider by id, plus their recent jobs.', parameters: { type: 'object', properties: { providerId: { type: 'string' } }, required: ['providerId'] } }, handler: getProviderDetail },
  { spec: { name: 'list_disputes', description: 'List disputes, optionally filtered by status (open, under_review, resolved_refund, resolved_no_refund, resolved_other, closed).', parameters: { type: 'object', properties: { status: { type: 'string' } } } }, handler: listDisputes },
  { spec: { name: 'get_dispute', description: 'Full detail on one dispute by id.', parameters: { type: 'object', properties: { disputeId: { type: 'string' } }, required: ['disputeId'] } }, handler: getDispute },
  { spec: { name: 'list_jobs', description: 'List recent jobs, optionally filtered by status.', parameters: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } } }, handler: listJobs },
  { spec: { name: 'get_job', description: 'Full detail on one job by id, including its payment if any.', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } }, handler: getJob },
  { spec: { name: 'list_reviews', description: 'List recent reviews. Set onlyHidden true to see already-hidden ones.', parameters: { type: 'object', properties: { onlyHidden: { type: 'boolean' } } } }, handler: listReviews },
  { spec: { name: 'list_support_threads', description: 'List support inbox threads. Set onlyUnresolved true to see only threads whose latest message is still from the customer (unanswered).', parameters: { type: 'object', properties: { onlyUnresolved: { type: 'boolean' } } } }, handler: listSupportThreads },
  { spec: { name: 'get_support_thread', description: 'Full message history of one user\'s support thread.', parameters: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] } }, handler: getSupportThread },
  { spec: { name: 'get_platform_overview', description: 'Quick platform-wide counts: active users/providers, total jobs, open disputes, unanswered support threads.', parameters: { type: 'object', properties: {} } }, handler: getPlatformOverview },

  { spec: { name: 'reply_to_support', description: 'Send a support reply to a specific user\'s thread immediately. Runs right away, no approval needed.', parameters: { type: 'object', properties: { userId: { type: 'string' }, message: { type: 'string' } }, required: ['userId', 'message'] } }, handler: replyToSupport, needsCtx: true },
  { spec: { name: 'verify_provider', description: 'Mark a provider as verified. Runs immediately.', parameters: { type: 'object', properties: { providerId: { type: 'string' } }, required: ['providerId'] } }, handler: verifyProvider, needsCtx: true },
  { spec: { name: 'reactivate_user', description: 'Reactivate a suspended user account. Runs immediately.', parameters: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] } }, handler: reactivateUser, needsCtx: true },
  { spec: { name: 'reactivate_provider', description: 'Reactivate a suspended provider. Runs immediately.', parameters: { type: 'object', properties: { providerId: { type: 'string' } }, required: ['providerId'] } }, handler: reactivateProvider, needsCtx: true },

  { spec: { name: 'suspend_user', description: 'Suspend a user account. Risky -- only queues it for one-click admin approval, does not run immediately.', parameters: { type: 'object', properties: { userId: { type: 'string' }, reason: { type: 'string' } }, required: ['userId'] } }, handler: suspendUser, needsCtx: true },
  { spec: { name: 'suspend_provider', description: 'Suspend a provider. Risky -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { providerId: { type: 'string' }, reason: { type: 'string' } }, required: ['providerId'] } }, handler: suspendProvider, needsCtx: true },
  { spec: { name: 'delete_user', description: 'Soft-delete a user account. Risky -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { userId: { type: 'string' }, reason: { type: 'string' } }, required: ['userId'] } }, handler: deleteUser, needsCtx: true },
  { spec: { name: 'promote_user_to_admin', description: 'Grant a user full admin access. Risky -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] } }, handler: promoteUserToAdmin, needsCtx: true },
  { spec: { name: 'refund_job', description: 'Refund the payment for a job. Risky (moves money) -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { jobId: { type: 'string' }, reason: { type: 'string' } }, required: ['jobId'] } }, handler: refundJob, needsCtx: true },
  { spec: { name: 'resolve_dispute', description: 'Resolve a dispute, with or without a refund. Risky -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { disputeId: { type: 'string' }, resolution: { type: 'string', enum: ['resolved_refund', 'resolved_no_refund', 'resolved_other'] }, notes: { type: 'string' } }, required: ['disputeId', 'resolution'] } }, handler: resolveDispute, needsCtx: true },
  { spec: { name: 'hide_review', description: 'Hide a review from public view. Risky -- only queues it for one-click admin approval.', parameters: { type: 'object', properties: { reviewId: { type: 'string' }, reason: { type: 'string' } }, required: ['reviewId'] } }, handler: hideReview, needsCtx: true },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.spec.name, t]));

const GROQ_TOOLS = TOOLS.map((t) => ({ type: 'function', function: t.spec }));

/**
 * Runs one admin command through the full tool-calling loop and returns the
 * assistant's final reply text. `history` is an optional array of prior
 * {role, content} turns from the same command-panel session, so a follow-up
 * like "yes, do it" or "the second one" can resolve against what was just
 * discussed -- the client is expected to keep and resend this, since nothing
 * about a single command call is persisted server-side beyond the resulting
 * agency_items.
 */
export async function runAdminCommand({ text, adminUser, history = [] }) {
  if (!groqConfigured()) {
    return { reply: "The command box needs Groq configured on the server (GROQ_API_KEY) to work -- it isn't right now." };
  }

  const ctx = { adminUser, commandText: text };
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-12),
    { role: 'user', content: text },
  ];

  const actionsRun = [];

  for (let turn = 0; turn < 6; turn++) {
    const message = await chatCompletion({
      messages,
      tools: GROQ_TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    });
    messages.push(message);

    if (!message.tool_calls?.length) {
      return { reply: message.content || "I've got nothing further to add.", actionsRun };
    }

    for (const call of message.tool_calls) {
      const tool = TOOL_BY_NAME[call.function.name];
      let result;
      if (!tool) {
        result = { error: `Unknown tool "${call.function.name}".` };
      } else {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          result = { error: 'Could not parse arguments.' };
        }
        if (!result) {
          try {
            result = await tool.handler(args, ctx);
            if (tool.needsCtx) actionsRun.push({ tool: call.function.name, args, result });
          } catch (err) {
            result = { error: err.message || 'Tool call failed.' };
          }
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: truncate(JSON.stringify(result)),
      });
    }
  }

  return { reply: "That took more steps than I can safely chain in one go -- could you narrow the request down?", actionsRun };
}
