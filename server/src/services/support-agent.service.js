import { query } from '../lib/db.js';
import { chatCompletion, groqConfigured } from './groq.service.js';
import { notify } from './notification.service.js';
import { createAgencyItem } from './agency.service.js';
import { isAgencyEnabled, isAutoScanEnabled } from './settings.service.js';

// Broadened from the original FAQ-only version: the model is now handed a
// read-only snapshot of the customer's own account (their recent jobs,
// payment/dispute status) so it can answer real "what's going on with my
// job" questions with facts that are actually true right now, not just
// generic help-center copy. It still never gets to change anything or
// promise a future action -- see gatherCustomerContext below, which only
// ever SELECTs, and the rule in the prompt to escalate anything that needs
// a decision rather than a fact.
const FAQ_POLICY = `You triage a single incoming customer-support message for Taskora, a local
services marketplace. You're given the customer's own account context (their recent jobs,
payments, disputes) as read-only, factual data, plus their message. Decide whether it's safe
to auto-answer with a short, warm reply, or whether it needs a human.

Auto-answer when either:
(a) it's a stock question with a single stable, correct answer that doesn't depend on this
    customer's specific account, e.g. how the platform works in general, how to contact a
    provider, how to switch between customer/provider mode, what Pro/Boost subscriptions are,
    general "how do refunds work" policy; or
(b) it's a factual question about their OWN account that the provided context directly and
    unambiguously answers -- e.g. the status of a specific job, whether a provider has
    accepted/completed a job, whether a payment succeeded -- and answering only requires
    reporting what the context already shows, not deciding anything.

Always escalate to a human (never auto-answer) for: any request that requires a decision or
action (a refund, cancelling or changing a job, resolving a dispute, an account change);
anything the account context doesn't clearly cover; account access/login problems; anything
angry, distressed, or reporting a scam/safety issue; anything you are not fully confident
about. Never invent a status, date, or amount that isn't literally present in the given
context, and never promise that something will happen -- only report what's already true.

Respond with ONLY a JSON object: {"canAutoAnswer": boolean, "reply": string
or null, "reason": string}. "reply" (only when canAutoAnswer is true) is the
exact short message to send back to the customer -- warm, concise, a few
sentences max. "reason" is one short sentence explaining the decision,
always included.`;

/**
 * Read-only snapshot of one customer's own account -- their profile mode,
 * provider record if they have one, their most recent jobs on both sides of
 * the marketplace, and any open disputes involving them. Never writes
 * anything; this exists purely so the support agent can answer real
 * questions about "my job" / "my payment" with facts instead of guessing or
 * escalating everything.
 */
async function gatherCustomerContext(userId) {
  const [jobsAsCustomer, jobsAsProvider, disputes] = await Promise.all([
    query(
      `SELECT j.id, j.status, j.service_description, j.created_at,
              COALESCE(NULLIF(pr.business_name,''), pr.display_name) AS provider_name,
              p.status AS payment_status
         FROM jobs j
         JOIN providers pr ON pr.id = j.provider_id
         LEFT JOIN payments p ON p.job_id = j.id
        WHERE j.customer_id = $1 ORDER BY j.created_at DESC LIMIT 5`,
      [userId]
    ),
    query(
      `SELECT j.id, j.status, j.service_description, j.created_at, cu.first_name AS customer_first_name
         FROM jobs j JOIN providers pr ON pr.id = j.provider_id JOIN users cu ON cu.id = j.customer_id
        WHERE pr.user_id = $1 ORDER BY j.created_at DESC LIMIT 5`,
      [userId]
    ),
    query(
      `SELECT id, job_id, status, reason, created_at FROM disputes
        WHERE raised_by_user_id = $1 OR against_user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    ),
  ]);
  return {
    recentJobsAsCustomer: jobsAsCustomer.rows,
    recentJobsAsProvider: jobsAsProvider.rows,
    recentDisputes: disputes.rows,
  };
}

/**
 * Runs right after a user's support message is saved (support.routes.js),
 * and also re-run per still-unanswered thread by runAutoScanSweep below.
 * Fire-and-forget from the caller's point of view in effect -- every path
 * through here is wrapped so a Groq outage/rate-limit never breaks sending
 * the customer's own message: worst case, it silently falls back to "a
 * human will see this," which is exactly today's behavior with no agent at
 * all.
 */
export async function handleIncomingSupportMessage({ userId, userMessageId, body, userName }) {
  // Master switch, off by default -- see settings.service.js. While off,
  // this does nothing at all: no Groq call, no agency item. The message
  // itself is already saved by support.routes.js regardless, so a human
  // still sees it in the regular Support tab exactly as before this system
  // existed. This also makes the auto-scan sweep a no-op whenever Auto-reply
  // itself is off, since there'd be nothing for it to send.
  if (!(await isAgencyEnabled())) return;

  // dedupeKey is the same for every escalation path below (not-configured,
  // triage-failed, or a genuine escalation decision) -- one open Agency item
  // per unanswered thread, bumped rather than duplicated on every retry,
  // whether that retry comes from the customer sending another message or
  // from the periodic auto-scan sweep re-checking the same still-open thread.
  const dedupeKey = `support_escalation:${userId}`;

  if (!groqConfigured()) {
    await createAgencyItem({
      kind: 'support_escalation',
      title: `Support message from ${userName}`,
      summary: body.slice(0, 300),
      relatedUserId: userId,
      detail: { userMessageId, reason: 'AI triage unavailable (Groq not configured).' },
      dedupeKey,
    });
    return;
  }

  let decision;
  let context;
  try {
    context = await gatherCustomerContext(userId);
    const message = await chatCompletion({
      messages: [
        { role: 'system', content: FAQ_POLICY },
        {
          role: 'user',
          content: `Customer's own account context (read-only, factual):\n${JSON.stringify(context)}\n\nCustomer's message: "${body}"`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    decision = JSON.parse(message.content);
  } catch (err) {
    // Groq down, rate-limited, or returned something unparseable -- fail
    // safe by escalating rather than guessing, and record why so a
    // repeating failure (e.g. sustained rate-limiting) is visible in the
    // Agency tab instead of silently degrading support for everyone.
    await createAgencyItem({
      kind: 'support_escalation',
      severity: 'warning',
      title: `Support message from ${userName} (AI triage failed)`,
      summary: body.slice(0, 300),
      relatedUserId: userId,
      detail: { userMessageId, error: err.message },
      dedupeKey,
    });
    return;
  }

  if (decision.canAutoAnswer && decision.reply) {
    const { rows } = await query(
      `INSERT INTO support_messages (user_id, sender, body) VALUES ($1, 'admin', $2) RETURNING *`,
      [userId, decision.reply]
    );
    await notify(userId, {
      type: 'support_reply',
      title: 'Taskora Support replied',
      body: decision.reply.slice(0, 140),
      data: {},
    });
    await createAgencyItem({
      kind: 'support_auto_reply',
      title: `Auto-replied to ${userName}`,
      summary: decision.reason,
      detail: { userMessageId, replyMessageId: rows[0].id, question: body, reply: decision.reply },
      relatedUserId: userId,
      // Already fully handled -- nothing for an admin to do, so this belongs
      // in "Recently handled" immediately rather than sitting open forever.
      status: 'auto_resolved',
    });
  } else {
    await createAgencyItem({
      kind: 'support_escalation',
      title: `Support message from ${userName}`,
      summary: decision.reason || 'Needs a human reply.',
      detail: { userMessageId, question: body },
      relatedUserId: userId,
      dedupeKey,
    });
  }
}

/**
 * The continuous "no waiting messages left unreplied" sweep -- called on a
 * timer from index.js. Independent of the real-time trigger above: catches
 * anything that slipped through it (Groq was down when the message first
 * arrived, Auto-reply was briefly off, or the account's situation has since
 * changed enough that a question is now answerable). Re-triages every
 * support thread whose most recent message is still from the customer
 * (i.e. genuinely unanswered) exactly as if it had just arrived -- safe to
 * run repeatedly since createAgencyItem's dedupeKey bumps rather than
 * duplicates, and a thread that gets auto-answered simply stops matching
 * "latest message is from the customer" on the next pass.
 */
export async function runAutoScanSweep() {
  if (!(await isAutoScanEnabled())) return;

  const { rows } = await query(`
    SELECT sm.user_id, sm.id AS user_message_id, sm.body, u.first_name, u.last_name
      FROM support_messages sm
      JOIN users u ON u.id = sm.user_id
     WHERE sm.sender = 'user'
       AND NOT EXISTS (
         SELECT 1 FROM support_messages sm2 WHERE sm2.user_id = sm.user_id AND sm2.created_at > sm.created_at
       )
  `);

  for (const row of rows) {
    try {
      await handleIncomingSupportMessage({
        userId: row.user_id,
        userMessageId: row.user_message_id,
        body: row.body,
        userName: `${row.first_name} ${row.last_name}`.trim(),
      });
    } catch (err) {
      console.error('agency auto-scan sweep failed for user', row.user_id, err.message);
    }
  }
}
