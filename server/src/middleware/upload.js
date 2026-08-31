import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { badRequest } from '../lib/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR?.replace('./', '') || 'uploads');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeStorage(subdir) {
  const dir = path.join(uploadRoot, subdir);
  ensureDir(dir);
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(badRequest('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
  }
  cb(null, true);
}

export function uploader(subdir, { maxSizeMb = 8 } = {}) {
  return multer({
    storage: makeStorage(subdir),
    fileFilter,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
  });
}

export function publicUrlFor(subdir, filename) {
  const base = process.env.PUBLIC_UPLOAD_BASE_URL || '/uploads';
  return `${base}/${subdir}/${filename}`;
}
