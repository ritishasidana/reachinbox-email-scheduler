import path from 'path';
import type { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { badRequest, notFound } from '../utils/errors';

export async function upload(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw badRequest('No files uploaded (field name: "files")');
  const created = await prisma.$transaction(
    files.map((f) =>
      prisma.attachment.create({
        data: {
          userId: req.user!.id,
          filename: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          storagePath: f.path,
        },
      }),
    ),
  );
  res.status(201).json({
    items: created.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: `/api/attachments/${a.id}`,
    })),
  });
}

export async function download(req: Request, res: Response): Promise<void> {
  const attachment = await prisma.attachment.findFirst({ where: { id: req.params.id!, userId: req.user!.id } });
  if (!attachment) throw notFound('Attachment not found');
  const inline = attachment.mimeType.startsWith('image/');
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(attachment.filename)}"`,
  );
  res.sendFile(path.resolve(attachment.storagePath));
}
