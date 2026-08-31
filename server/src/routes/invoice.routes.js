import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, notFound, forbidden } from '../lib/errors.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { sendMessage, getOrCreateConversation } from '../services/message.service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.current_mode === 'provider' && req.user.provider_id) {
      const { rows } = await query('SELECT * FROM invoices WHERE provider_id = $1 ORDER BY created_at DESC', [req.user.provider_id]);
      return res.json({ invoices: rows });
    }
    const { rows } = await query('SELECT * FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ invoices: rows });
  })
);

router.get(
  '/job/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM invoices WHERE job_id = $1', [req.params.jobId]);
    const invoice = rows[0];
    if (!invoice) throw notFound('No invoice for this job yet.');
    if (invoice.customer_id !== req.user.id && invoice.provider_id !== req.user.provider_id && req.user.role !== 'admin') {
      throw forbidden('You do not have access to this invoice.');
    }
    res.json({ invoice });
  })
);

router.post(
  '/:id/share',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM invoices WHERE id = $1 AND provider_id = $2', [req.params.id, req.user.provider_id]);
    const invoice = rows[0];
    if (!invoice) throw notFound('Invoice not found.');
    const conv = await getOrCreateConversation(invoice.customer_id, req.user.provider_id);
    const message = await sendMessage({
      conversationId: conv.id,
      senderUserId: req.user.id,
      type: 'invoice',
      body: `Invoice ${invoice.invoice_number} — $${invoice.amount_total}`,
      metadata: { invoiceId: invoice.id, pdfPath: invoice.pdf_path },
    });
    res.json({ message });
  })
);

export default router;
