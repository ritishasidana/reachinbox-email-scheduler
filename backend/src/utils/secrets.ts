import { env } from '../config/env';
import { decryptWithKey, encryptWithKey } from './crypto';

export const encryptSecret = (plaintext: string): string => encryptWithKey(env.ENCRYPTION_KEY, plaintext);
export const decryptSecret = (payload: string): string => decryptWithKey(env.ENCRYPTION_KEY, payload);
