import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';

/**
 * Email attachments: held in memory and stored in Postgres (Attachment.content), so the API and a
 * worker running on a different machine (e.g. GitHub Actions) can both read them. Older attachments
 * that were written to UPLOAD_DIR on disk remain readable via Attachment.storagePath.
 */
export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
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
