import { query, withTransaction } from '../lib/db.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/errors.js';
import { getOrCreateConversation, sendMessage } from './message.service.js';
import { notify } from './notification.service.js';
import { computeFeeSplit } from './job.service.js';

export async function createQuoteRequest({ customerId, providerId, serviceId = null, message = null }) {
  const { rows: providerRows } = await query("SELECT id, user_id FROM providers WHERE id = $1 AND status = 'active'", [
    providerId,
  ]);
  const provider = providerRows[0];
  if (!provider) throw badRequest('This provider is not available right now.');
  if (provider.user_id === customerId) throw badRequest('You cannot request a quote from your own provider profile.');

  return withTransaction(async (client) => {
    const conv = await getOrCreateConversation(customerId, providerId, client);
    const { rows } = await client.query(
      `INSERT INTO quote_requests (conversation_id, customer_id, provider_id, service_id, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conv.id, customerId, providerId, serviceId, message]
    );
    const qr = rows[0];
    await client.query(
      `INSERT INTO messages (conversation_id, sender_user_id, sender_role, type, body, metadata)
       VALUES ($1, $2, 'user', 'quote_request', $3, $4)`,
      [conv.id, customerId, message || 'Requested a quote.', JSON.stringify({ quoteRequestId: qr.id })]
    );
    await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conv.id]);
    await notify(provider.user_id, {
      type: 'quote_request',
      title: 'New quote request',
      body: message?.slice(0, 140) || 'A customer requested a quote.',
      data: { quoteRequestId: qr.id, conversationId: conv.id },
      client,
    });
    return qr;
  });
}

async function loadQuoteRequestForProvider(id, providerId) {
  const { rows } = await query('SELECT * FROM quote_requests WHERE id = $1', [id]);
  const qr = rows[0];
  if (!qr) throw notFound('Quote request not found.');
  if (qr.provider_id !== providerId) throw forbidden('This is not your quote request.');
  return qr;
}

export async function sendQuote({ quoteRequestId, providerId, price, description, scheduledDate, scheduledTime, notes, expiresInHours }) {
  const qr = await loadQuoteRequestForProvider(quoteRequestId, providerId);
  if (qr.status === 'declined') throw conflict('This quote request was already declined.');

  return withTransaction(async (client) => {
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null;
    const { rows } = await client.query(
      `INSERT INTO quotes (quote_request_id, provider_id, customer_id, price, description, scheduled_date, scheduled_time, notes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [quoteRequestId, providerId, qr.customer_id, price, description, scheduledDate || null, scheduledTime || null, notes, expiresAt]
    );
    const quote = rows[0];
    await client.query(`UPDATE quote_requests SET status = 'responded', updated_at = now() WHERE id = $1`, [quoteRequestId]);
    await client.query(
      `INSERT INTO messages (conversation_id, sender_user_id, sender_role, type, body, metadata)
       VALUES ($1, $2, 'user', 'quote', $3, $4)`,
      [qr.conversation_id, null, `Sent a quote for $${price}`, JSON.stringify({ quoteId: quote.id })]
    );
    await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [qr.conversation_id]);
    await notify(qr.customer_id, {
      type: 'quote_received',
      title: 'You received a quote',
      body: `A provider sent you a quote for $${price}.`,
      data: { quoteId: quote.id, conversationId: qr.conversation_id },
      client,
    });
    return quote;
  });
}

export async function declineQuoteRequest({ quoteRequestId, providerId, reason }) {
  const qr = await loadQuoteRequestForProvider(quoteRequestId, providerId);
  await query(`UPDATE quote_requests SET status = 'declined', updated_at = now() WHERE id = $1`, [quoteRequestId]);
  await sendMessage({
    conversationId: qr.conversation_id,
    senderUserId: null,
    senderRole: 'system',
    type: 'system',
    body: reason ? `The provider declined this request: ${reason}` : 'The provider declined this quote request.',
  });
  return { success: true };
}

export async function acceptQuote({ quoteId, customerId }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM quotes WHERE id = $1 FOR UPDATE', [quoteId]);
    const quote = rows[0];
    if (!quote) throw notFound('Quote not found.');
    if (quote.customer_id !== customerId) throw forbidden('This is not your quote.');
    if (quote.status !== 'sent') throw conflict(`This quote can no longer be accepted (status: ${quote.status}).`);
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      await client.query(`UPDATE quotes SET status = 'expired' WHERE id = $1`, [quoteId]);
      throw conflict('This quote has expired.');
    }

    // jobs.price is the provider's quoted service price (what they're paid in full —
    // see computeFeeSplit). Taskora's 10% fee is a surcharge added on top of this and
    // charged to the customer separately at checkout; it is never deducted from here.
    const { platformFee, providerAmount } = computeFeeSplit(quote.price);

    const { rows: jobRows } = await client.query(
      `INSERT INTO jobs (quote_id, customer_id, provider_id, service_description, price, platform_fee, provider_amount, scheduled_date, scheduled_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'quote_accepted') RETURNING *`,
      [quote.id, customerId, quote.provider_id, quote.description || 'Service job', providerAmount, platformFee, providerAmount, quote.scheduled_date, quote.scheduled_time]
    );
    const job = jobRows[0];
    await client.query('INSERT INTO job_state_history (job_id, from_status, to_status, changed_by_user_id) VALUES ($1, NULL, $2, $3)', [
      job.id,
      'quote_accepted',
      customerId,
    ]);
    await client.query(`UPDATE quotes SET status = 'accepted', updated_at = now() WHERE id = $1`, [quoteId]);

    const { rows: providerRows } = await client.query('SELECT user_id FROM providers WHERE id = $1', [quote.provider_id]);
    await notify(providerRows[0].user_id, {
      type: 'quote_accepted',
      title: 'Your quote was accepted!',
      body: `The customer accepted your $${quote.price} quote. Next: they'll pay to confirm the job.`,
      data: { jobId: job.id },
      client,
    });

    return job;
  });
}

export async function declineQuote({ quoteId, customerId }) {
  const { rows } = await query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
  const quote = rows[0];
  if (!quote) throw notFound('Quote not found.');
  if (quote.customer_id !== customerId) throw forbidden('This is not your quote.');
  if (quote.status !== 'sent') throw conflict('This quote is no longer pending.');
  await query(`UPDATE quotes SET status = 'declined', updated_at = now() WHERE id = $1`, [quoteId]);
  return { success: true };
}

export async function requestQuoteChanges({ quoteId, customerId, message }) {
  const { rows } = await query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
  const quote = rows[0];
  if (!quote) throw notFound('Quote not found.');
  if (quote.customer_id !== customerId) throw forbidden('This is not your quote.');
  await query(`UPDATE quotes SET status = 'changes_requested', updated_at = now() WHERE id = $1`, [quoteId]);
  const { rows: qrRows } = await query('SELECT conversation_id FROM quote_requests WHERE id = $1', [quote.quote_request_id]);
  await sendMessage({
    conversationId: qrRows[0].conversation_id,
    senderUserId: customerId,
    body: message || 'Could you adjust this quote?',
  });
  return { success: true };
}
