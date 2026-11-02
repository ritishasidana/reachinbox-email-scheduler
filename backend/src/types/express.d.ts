import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauthState?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        avatarUrl: string | null;
      };
    }
  }
}

export {};
