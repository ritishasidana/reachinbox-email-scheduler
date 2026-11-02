import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';

/** Email attachments: stored on local disk under UPLOAD_DIR/<userId>/ (swap for S3/GCS in production). */
export const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(env.UPLOAD_DIR, req.user!.id);
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: env.MAX_ATTACHMENT_BYTES, files: 10 },
});

/** Recipient lists: parsed in memory, never stored. */
export const recipientListUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(badRequest('Only .csv and .txt files are supported'));
  },
});
