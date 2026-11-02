import type { Attachment } from '../types';
import { api } from './api';

export const attachmentService = {
  async upload(files: File[]): Promise<Attachment[]> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const { data } = await api.post<{ items: Attachment[] }>('/attachments', form, { timeout: 120_000 });
    return data.items;
  },
};
