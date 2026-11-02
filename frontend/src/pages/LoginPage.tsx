import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { GoogleIcon, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'Google login is not configured on the server yet (GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI).',
  invalid_state: 'Your login session expired. Please try again.',
  google_login_failed: 'Google login failed. Please try again.',
  access_denied: 'Google login was cancelled.',
};

export function LoginPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const errorCode = params.get('error');
  const error = errorCode ? ERROR_MESSAGES[errorCode] ?? `Login failed: ${errorCode}` : null;

  useEffect(() => {
    authService
      .config()
      .then((c) => setGoogleConfigured(c.googleConfigured))
      .catch(() => setGoogleConfigured(null));
  }, []);

  if (!loading && user) return <Navigate to="/scheduled" replace />;

  const onGoogle = () => {
    setRedirecting(true);
    authService.startGoogleLogin();
  };

  // Design includes email/password fields; this deployment authenticates with Google only.
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNotice('Email & password sign-in is not enabled for this workspace. Please continue with Google.');
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-[372px] rounded-xl border border-line bg-white px-6 py-10 sm:px-11">
        <h1 className="mb-6 text-center text-[28px] font-bold text-ink">Login</h1>

        {(error || notice) && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error ?? notice}
          </p>
        )}
        {googleConfigured === false && !error && (
          <p className="mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Google OAuth credentials are not configured on the backend yet.
          </p>
        )}

        <button
          type="button"
          onClick={onGoogle}
          disabled={redirecting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-light py-2.5 text-[13px] text-ink transition-colors hover:bg-[#d6eedd] disabled:opacity-70"
        >
          {redirecting ? <Spinner className="h-4 w-4" /> : <GoogleIcon />}
          Login with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-[10px] text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onSubmit} className="space-y-2.5">
          <input type="email" placeholder="Email ID" aria-label="Email ID" className="field-input text-xs" autoComplete="email" />
          <input
            type="password"
            placeholder="Password"
            aria-label="Password"
            className="field-input text-xs"
            autoComplete="current-password"
          />
          <button type="submit" className="btn-primary mt-3 w-full text-[13px] font-normal">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
