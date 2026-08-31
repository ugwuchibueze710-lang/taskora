import { query, withTransaction } from '../lib/db.js';
import { conflict, notFound } from '../lib/errors.js';
import { notify } from './notification.service.js';

export const PLATFORM_FEE_RATE = 0.1; // Taskora's 10% platform fee, applied transparently everywhere.

export function computeFeeSplit(price) {
  const total = Math.round(Number(price) * 100) / 100;
  const platformFee = Math.round(total * PLATFORM_FEE_RATE * 100) / 100;
  const providerAmount = Math.round((total - platformFee) * 100) / 100;
  return { total, platformFee, providerAmount };
}

// The only legal state transitions. Anything not listed here is rejected —
// there is no path that lets client code "jump" a job into a later state.
const TRANSITIONS = {
  quote_accepted: ['payment_pending', 'cancelled'],
  payment_pending: ['paid', 'quote_accepted', 'cancelled'],
  paid: ['provider_accepted', 'cancelled', 'disputed'],
  provider_accepted: ['in_progress', 'provider_marked_complete', 'cancelled', 'disputed'],
  in_progress: ['provider_marked_complete', 'cancelled', 'disputed'],
  provider_marked_complete: ['customer_confirmed', 'disputed', 'cancelled'],
  customer_confirmed: ['completed'],
  completed: ['disputed'],
  disputed: ['refunded', 'completed', 'cancelled'],
  cancelled: [],
  refunded: [],
};

export async function transitionJob(jobId, toStatus, { byUserId = null, reason = null, client = null } = {}) {
  const run = async (c) => {
    const { rows } = await c.query('SELECT * FROM jobs WHERE id = $1 FOR UPDATE', [jobId]);
    const job = rows[0];
    if (!job) throw notFound('Job not found.');
    const allowed = TRANSITIONS[job.status] || [];
    if (!allowed.includes(toStatus)) {
      throw conflict(`Cannot move job from "${job.status}" to "${toStatus}".`);
    }
    const extra = [];
    const params = [toStatus];
    let setClause = 'status = $1, updated_at = now()';
    if (toStatus === 'completed') setClause += ', completed_at = now()';
    if (toStatus === 'cancelled') setClause += ', cancelled_at = now()';

    const { rows: updatedRows } = await c.query(`UPDATE jobs SET ${setClause} WHERE id = $2 RETURNING *`, [
      toStatus,
      jobId,
    ]);
    await c.query(
      `INSERT INTO job_state_history (job_id, from_status, to_status, changed_by_user_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, job.status, toStatus, byUserId, reason]
    );
    return updatedRows[0];
  };
  return client ? run(client) : withTransaction(run);
}

export async function getJobForUser(jobId, user) {
  const { rows } = await query(
    `SELECT j.*, pr.user_id AS provider_user_id, COALESCE(pr.business_name, pr.display_name) AS provider_name,
            cu.first_name AS customer_first_name, cu.last_name AS customer_last_name
       FROM jobs j
       JOIN providers pr ON pr.id = j.provider_id
       JOIN users cu ON cu.id = j.customer_id
      WHERE j.id = $1`,
    [jobId]
  );
  const job = rows[0];
  if (!job) throw notFound('Job not found.');
  const isCustomer = job.customer_id === user.id;
  const isProvider = job.provider_user_id === user.id;
  if (!isCustomer && !isProvider && user.role !== 'admin') {
    const { forbidden } = await import('../lib/errors.js');
    throw forbidden('You do not have access to this job.');
  }
  return { job, isCustomer, isProvider };
}

export async function notifyJobParties(job, { customerTitle, customerBody, providerTitle, providerBody, type }) {
  if (customerTitle) {
    await notify(job.customer_id, { type, title: customerTitle, body: customerBody, data: { jobId: job.id } });
  }
  if (providerTitle) {
    // `job` is often the plain row returned by transitionJob() (jobs columns only),
    // so resolve the provider's user id here rather than assuming it was joined in.
    let providerUserId = job.provider_user_id;
    if (!providerUserId) {
      const { rows } = await query('SELECT user_id FROM providers WHERE id = $1', [job.provider_id]);
      providerUserId = rows[0]?.user_id;
    }
    if (providerUserId) {
      await notify(providerUserId, { type, title: providerTitle, body: providerBody, data: { jobId: job.id } });
    }
  }
}
