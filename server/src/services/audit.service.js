import { query } from '../lib/db.js';

export async function logAudit({ userId = null, eventType, details = null, req = null }) {
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  await query(
    `INSERT INTO audit_events (user_id, event_type, details, ip_address) VALUES ($1, $2, $3, $4)`,
    [userId, eventType, details ? JSON.stringify(details) : null, ip]
  );
}

export async function logAdminAction({ adminUserId, actionType, targetType = null, targetId = null, details = null }) {
  await query(
    `INSERT INTO admin_actions (admin_user_id, action_type, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminUserId, actionType, targetType, targetId, details ? JSON.stringify(details) : null]
  );
}
