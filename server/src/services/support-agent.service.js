import { query } from '../lib/db.js';
import { chatCompletion, groqConfigured } from './groq.service.js';
import { notify } from './notification.service.js';
import { createAgencyItem } from './agency.service.js';
import { isAgencyEnabled } from './settings.service.js';

// Deliberately narrow: only genuinely stock, no-judgment-call questions get
// auto-answered. Anything about money, a specific account/job/dispute, or
// that the model isn't confident about must go to a human -- getting this
// wrong in the "too eager" direction (auto-replying to something that
// actually needed a person) is a much worse failure than escalating a
// question a human could've answered in five seconds, so the system prompt
// is written to be conservative on purpose.
const FAQ_POLICY = `You triage a single incoming customer-support message for Taskora, a local
services marketplace. Decide whether it's safe to auto-answer with a short,
generic help-center-style reply, or whether it needs a human.

Auto-answer ONLY for stock questions with a single stable, correct answer
that doesn't depend on this specific customer's account/job/payment state,
such as: how the platform works in general, how to contact a provider, how
to switch between customer/provider mode, what Pro/Boost subscriptions are,
general "how do refunds work" policy questions.

Always escalate to a human (never auto-answer) for: anything mentioning a
specific job, payment, dispute, refund request, provider or customer by
name; account access/login problems; anything angry, distressed, or
reporting a scam/safety issue; anything you are not fully confident about.

Respond with ONLY a JSON object: {"canAutoAnswer": boolean, "reply": string
or null, "reason": string}. "reply" (only when canAutoAnswer is true) is the
exact short message to send back to the customer -- warm, concise, a few
sentences max. "reason" is one short sentence explaining the decision,
always included.`;

/**
 * Runs right after a user's support message is saved (support.routes.js).
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
  // existed.
  if (!(await isAgencyEnabled())) return;

  if (!groqConfigured()) {
    await createAgencyItem({
      kind: 'support_escalation',
      title: `Support message from ${userName}`,
      summary: body.slice(0, 300),
      relatedUserId: userId,
      detail: { userMessageId, reason: 'AI triage unavailable (Groq not configured).' },
    });
    return;
  }

  let decision;
  try {
    const message = await chatCompletion({
      messages: [
        { role: 'system', content: FAQ_POLICY },
        { role: 'user', content: body },
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
      dedupeKey: 'support_agent_failure',
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
    });
  }
}
