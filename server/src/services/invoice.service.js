import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../lib/db.js';
import { publicUrlFor } from '../middleware/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR?.replace('./', '') || 'uploads');
const invoiceDir = path.join(uploadRoot, 'invoices');
fs.mkdirSync(invoiceDir, { recursive: true });

/**
 * Generates a real PDF invoice from a completed, paid job's actual
 * transaction data. Never called speculatively — only after a job has
 * genuinely reached a paid + confirmed state.
 */
export async function generateInvoiceForJob(jobId) {
  const existing = await query('SELECT * FROM invoices WHERE job_id = $1', [jobId]);
  if (existing.rows[0]) return existing.rows[0];

  const { rows } = await query(
    `SELECT j.*, p.amount_total, p.platform_fee AS payment_fee, p.provider_amount AS payment_provider_amount, p.status AS payment_status,
            cu.first_name AS customer_first, cu.last_name AS customer_last, cu.email AS customer_email,
            COALESCE(pr.business_name, pr.display_name) AS provider_name, pu.email AS provider_email
       FROM jobs j
       JOIN payments p ON p.job_id = j.id
       JOIN users cu ON cu.id = j.customer_id
       JOIN providers pr ON pr.id = j.provider_id
       JOIN users pu ON pu.id = pr.user_id
      WHERE j.id = $1`,
    [jobId]
  );
  const data = rows[0];
  if (!data) throw new Error('Cannot generate an invoice: job/payment data not found.');

  const { rows: seqRows } = await query("SELECT nextval('invoice_number_seq') AS n");
  const invoiceNumber = `TSK-${new Date().getFullYear()}-${seqRows[0].n}`;
  const filename = `${invoiceNumber}.pdf`;
  const filePath = path.join(invoiceDir, filename);

  await renderInvoicePdf(filePath, { ...data, invoiceNumber });

  const { rows: invoiceRows } = await query(
    `INSERT INTO invoices (job_id, invoice_number, customer_id, provider_id, pdf_path, amount_total, platform_fee, provider_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [jobId, invoiceNumber, data.customer_id, data.provider_id, publicUrlFor('invoices', filename), data.amount_total, data.payment_fee, data.payment_provider_amount]
  );
  return invoiceRows[0];
}

function renderInvoicePdf(filePath, data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(22).fillColor('#e8622c').text('Taskora', { continued: false });
    doc.fontSize(10).fillColor('#666').text('Local Service Auction House');
    doc.moveDown(1.5);

    doc.fontSize(16).fillColor('#111').text('Invoice');
    doc.fontSize(10).fillColor('#444');
    doc.text(`Invoice #: ${data.invoiceNumber}`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`);
    doc.text(`Job reference: ${data.id}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#111').text('Billed to');
    doc.fontSize(10).fillColor('#444').text(`${data.customer_first} ${data.customer_last}`);
    doc.text(data.customer_email);
    doc.moveDown();

    doc.fontSize(12).fillColor('#111').text('Service provider');
    doc.fontSize(10).fillColor('#444').text(data.provider_name || 'Taskora Provider');
    doc.text(data.provider_email);
    doc.moveDown();

    doc.fontSize(12).fillColor('#111').text('Service');
    doc.fontSize(10).fillColor('#444').text(data.service_description || 'Service job');
    doc.moveDown();

    const tableTop = doc.y + 10;
    doc.fontSize(10).fillColor('#111');
    doc.text('Description', 50, tableTop);
    doc.text('Amount', 450, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#ddd').stroke();

    let y = tableTop + 25;
    doc.fontSize(10).fillColor('#444');
    doc.text('Service total', 50, y);
    doc.text(`$${Number(data.amount_total).toFixed(2)}`, 450, y);
    y += 20;
    doc.text('Taskora platform fee (10%)', 50, y);
    doc.text(`-$${Number(data.payment_fee).toFixed(2)}`, 450, y);
    y += 20;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
    y += 10;
    doc.fontSize(11).fillColor('#111').text('Provider payout', 50, y);
    doc.text(`$${Number(data.payment_provider_amount).toFixed(2)}`, 450, y);
    y += 30;

    doc.fontSize(11).fillColor('#111').text('Payment status', 50, y);
    doc.fillColor('#2e8b57').text(data.payment_status === 'succeeded' ? 'Paid' : data.payment_status, 450, y);

    doc.moveDown(4);
    doc.fontSize(9).fillColor('#999').text('Thank you for using Taskora — your local service auction house.', 50, 750, { align: 'center', width: 495 });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
