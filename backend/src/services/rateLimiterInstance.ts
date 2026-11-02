import { env } from '../config/env';
import { redis } from '../db/redis';
import { RateLimiter } from './rateLimiter.service';

export const rateLimiter = new RateLimiter(redis, env.RATE_LIMIT_LOOKAHEAD_HOURS);
