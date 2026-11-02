import session from 'express-session';
import RedisStore from 'connect-redis';
import { env, isProduction } from '../config/env';
import { redis } from '../db/redis';

export const SESSION_COOKIE = 'rib.sid';

/** Server-side sessions in Redis; the browser only holds an opaque, signed, HTTP-only cookie. */
export const sessionMiddleware = session({
  name: SESSION_COOKIE,
  store: new RedisStore({ client: redis, prefix: 'sess:' }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});
