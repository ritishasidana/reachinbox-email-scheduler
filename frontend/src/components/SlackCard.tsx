import { Hash, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../services/api';
import { slackService } from '../services/slackService';
import type { SlackStatus } from '../types';

/** Connect / Disconnect Slack (rate-limit notifications), shown at the bottom of the sidebar. */
export function SlackCard() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await slackService.status());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Result of the OAuth round-trip (?slack=connected | ?slack=error&reason=…). The ref keeps React
  // StrictMode's double-invoked effect (dev) from showing the toast twice.
  const handledResult = useRef<string | null>(null);
  useEffect(() => {
    const result = params.get('slack');
    if (!result) return;
    const key = `${result}:${params.get('reason') ?? ''}`;
    if (handledResult.current === key) return;
    handledResult.current = key;
    if (result === 'connected') toast.success('Slack connected. Hourly-limit alerts will be posted there.');
    else toast.error(`Slack connection failed: ${params.get('reason') ?? 'unknown error'}`);
    params.delete('slack');
    params.delete('reason');
    setParams(params, { replace: true });
    void load();
  }, [params, setParams, toast, load]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <div className="rounded-xl border border-line p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <Hash className="h-4 w-4 text-[#611f69]" />
        <span className="font-medium text-ink">Slack alerts</span>
        <span className={`ml-auto h-2 w-2 rounded-full ${status.connected ? 'bg-brand' : 'bg-gray-300'}`} />
      </div>
      {status.connected ? (
        <>
          <p className="mb-2 truncate text-ink-muted">
            {status.teamName ?? 'Workspace'}
            {status.channelName ? ` · ${status.channelName}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => slackService.test(), 'Test message sent to Slack')}
              className="flex-1 rounded-full border border-line py-1 text-ink hover:bg-field disabled:opacity-50"
            >
              Test
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => slackService.disconnect(), 'Slack disconnected')}
              className="flex-1 rounded-full border border-red-200 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : status.configured ? (
        <button disabled={busy} onClick={() => run(() => slackService.connect())} className="btn-outline w-full py-1 text-xs">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Connect Slack
        </button>
      ) : (
        <p className="text-ink-muted">Slack OAuth is not configured on the server.</p>
      )}
    </div>
  );
}
