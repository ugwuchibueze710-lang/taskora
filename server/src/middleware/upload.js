import multer from 'multer';
import crypto from 'crypto';
import { badRequest } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_FOR_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

// One shared bucket, with the same "avatars / providers / portfolio"
// subfolders the old local-disk uploads used -- now as a path prefix inside
// the bucket rather than a directory on this server's own filesystem, which
// is what makes an uploaded image survive a redeploy (this server, on
// Render's free plan, has no persistent disk of its own).
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'taskora-uploads';

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(badRequest('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
  }
  cb(null, true);
}

// multer now buffers the upload in memory instead of writing it to disk --
// uploadToStorage() below takes it from there and pushes it to Supabase
// Storage. Route handlers are otherwise unchanged (still req.file/req.files).
export function uploader(subdir, { maxSizeMb = 8 } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
  });
}

// Uploads one already-validated, in-memory file (multer memoryStorage --
// { buffer, mimetype }) to Supabase Storage and returns its public URL. This
// is the direct replacement for the old synchronous publicUrlFor(subdir,
// filename): every call site now needs `await`, since this is a real network
// call instead of a plain string join.
export async function uploadToStorage(subdir, file) {
  const filename = `${crypto.randomUUID()}${EXT_FOR_MIME[file.mimetype] || ''}`;
  const objectPath = `${subdir}/${filename}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Kept only for invoice PDFs (services/invoice.service.js), which still
// write to local disk via pdfkit and aren't part of this migration -- that
// wasn't part of what was asked for (profile/business/service images), and
// invoices are generated inline with the Stripe payment flow, which this
// change deliberately doesn't touch. Local-disk invoice storage is already a
// known, pre-existing limitation (Render's free plan has no persistent
// disk); this migration doesn't make that better or worse.
export function publicUrlFor(subdir, filename) {
  const base = process.env.PUBLIC_UPLOAD_BASE_URL || '/uploads';
  return `${base}/${subdir}/${filename}`;
}
