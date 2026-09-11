import { query } from '../lib/db.js';
import { notFound, conflict, badRequest } from '../lib/errors.js';
import { logAdminAction } from './audit.service.js';

/**
 * Creates (or, for a deduplicated error, bumps) one Agency item. This is the
 * single write path every agent (support auto-reply, error capture, action
 * suggestions) goes through, so the Agency tab is always a complete record
 * of everything the system noticed, did, or is asking about -- see
 * migration 015_agency.sql for the shape and why it's its own table.
 *
 * @param {string} dedupeKey - pass for error_diagnosis items so a repeating
 *   failure bumps occurrence_count on one open row instead of flooding the
 *   list with duplicates. Omit for one-off items (support messages, etc.).
 * @param {string} status - defaults to 'open'. Pass 'auto_resolved' for an
 *   item that represents something the system already fully handled on its
 *   own (e.g. an auto-sent support reply) -- there's nothing left for an
 *   admin to do, so it belongs in "Recently handled", not sitting open
 *   forever. Items actually awaiting a human (escalations, errors,
 *   approvals) should stay 'open' -- the default.
 */
export async function createAgencyItem({
  kind,
  severity = 'info',
  title,
  summary = null,
  detail = null,
  engineerPrompt = null,
  relatedUserId = null,
  proposedAction = null,
  dedupeKey = null,
  status = 'open',
}) {
  // A single atomic upsert rather than "UPDATE, then INSERT if nothing
  // matched" -- that two-step version has a real race under concurrent
  // requests (two errors with the same signature arriving at once could
  // both find nothing to UPDATE and then both try to INSERT, tripping the
  // partial unique index below). ON CONFLICT targeting that same partial
  // index makes the bump-or-create atomic. dedupeKey is NULL for one-off
  // items (support messages, etc.), which never conflicts with anything --
  // Postgres treats every NULL as distinct for uniqueness purposes.
  const { rows } = await query(
    `INSERT INTO agency_items
       (kind, severity, title, summary, detail, engineer_prompt, related_user_id, proposed_action, dedupe_key, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL
     DO UPDATE SET occurrence_count = agency_items.occurrence_count + 1, last_seen_at = now()
     RETURNING *`,
    [
      kind,
      severity,
      title,
      summary,
      detail ? JSON.stringify(detail) : null,
      engineerPrompt,
      relatedUserId,
      proposedAction ? JSON.stringify(proposedAction) : null,
      dedupeKey,
      status,
    ]
  );
  return rows[0];
}

export async function listAgencyItems({ status, kind, limit = 200 } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    conditions.push(`kind = $${params.length}`);
  }
  params.push(Math.min(limit, 500));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT ai.*, u.first_name, u.last_name, u.email AS related_user_email
       FROM agency_items ai
       LEFT JOIN users u ON u.id = ai.related_user_id
       ${where}
      ORDER BY ai.status = 'open' DESC, ai.last_seen_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getAgencyCounts() {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE status = 'open' AND proposed_action IS NOT NULL) AS needs_approval,
       count(*) FILTER (WHERE status = 'open' AND engineer_prompt IS NOT NULL) AS needs_engineer,
       count(*) FILTER (WHERE status = 'open') AS open_total
     FROM agency_items`
  );
  const r = rows[0];
  return { needsApproval: Number(r.needs_approval), needsEngineer: Number(r.needs_engineer), openTotal: Number(r.open_total) };
}

// A fixed, reversible allowlist -- deliberately small. Nothing here moves
// money or touches source code; those always require a manual admin click
// through the existing /admin routes (refund/dispute) or a human engineer
// (this app's server has no git credentials and no writable deploy target
// of its own, so "auto-apply a code fix" isn't something any agent running
// inside this process could safely do even if we wanted it to -- see the
// engineer_prompt path instead).
const SAFE_ACTIONS = {
  suspend_user: async (targetId) => {
    await query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [targetId]);
  },
  reactivate_user: async (targetId) => {
    await query(`UPDATE users SET status = 'active', updated_at = now() WHERE id = $1`, [targetId]);
  },
  hide_review: async (targetId) => {
    await query('UPDATE reviews SET is_hidden = true WHERE id = $1', [targetId]);
  },
};

export async function approveAgencyItem(itemId, adminUserId) {
  const { rows } = await query('SELECT * FROM agency_items WHERE id = $1', [itemId]);
  const item = rows[0];
  if (!item) throw notFound('Agency item not found.');
  if (item.status !== 'open') throw conflict('This item has already been resolved.');
  if (!item.proposed_action) throw badRequest('This item has no proposed action to approve.');

  const { actionType, targetId } = item.proposed_action;
  const run = SAFE_ACTIONS[actionType];
  if (!run) throw badRequest(`"${actionType}" is not an approvable action type.`);

  await run(targetId);
  await logAdminAction({
    adminUserId,
    actionType: `agency_approved:${actionType}`,
    targetType: item.proposed_action.targetType || null,
    targetId,
    details: { agencyItemId: item.id },
  });

  const { rows: updated } = await query(
    `UPDATE agency_items SET status = 'approved', resolved_at = now(), resolved_by = $2 WHERE id = $1 RETURNING *`,
    [itemId, adminUserId]
  );
  return updated[0];
}

export async function rejectAgencyItem(itemId, adminUserId) {
  const { rows } = await query(
    `UPDATE agency_items SET status = 'rejected', resolved_at = now(), resolved_by = $2
      WHERE id = $1 AND status = 'open' RETURNING *`,
    [itemId, adminUserId]
  );
  if (!rows[0]) throw notFound('Agency item not found, or already resolved.');
  return rows[0];
}

export async function dismissAgencyItem(itemId, adminUserId) {
  const { rows } = await query(
    `UPDATE agency_items SET status = 'resolved', resolved_at = now(), resolved_by = $2
      WHERE id = $1 AND status = 'open' RETURNING *`,
    [itemId, adminUserId]
  );
  if (!rows[0]) throw notFound('Agency item not found, or already resolved.');
  return rows[0];
}

// Called from admin.routes.js whenever an admin sends a support reply --
// closes out any open 'support_escalation' items for that user, since a
// human has now actually answered them. Without this, an escalation an
// admin handles through the normal Support tab (rather than by clicking
// something in the Agency tab) would sit "open" forever even though it's
// genuinely done.
export async function resolveOpenEscalationsForUser(userId, adminUserId) {
  await query(
    `UPDATE agency_items SET status = 'resolved', resolved_at = now(), resolved_by = $2
      WHERE related_user_id = $1 AND kind = 'support_escalation' AND status = 'open'`,
    [userId, adminUserId]
  );
}
