import { ArrowLeft, Clock, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecipientInput } from '../components/compose/RecipientInput';
import { RecipientReviewModal } from '../components/compose/RecipientReviewModal';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { SenderSelect } from '../components/compose/SenderSelect';
import { useToast } from '../context/ToastContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { getErrorMessage } from '../services/api';
import { attachmentService } from '../services/attachmentService';
import { emailService } from '../services/emailService';
import { senderService } from '../services/senderService';
import type { Attachment, RecipientParseResult, Sender } from '../types';
import { formatBytes, formatPickerLabel, newIdempotencyKey } from '../utils/format';
import { isValidEmail } from '../utils/recipients';
import axios from 'axios';

interface LocalAttachment extends Attachment {
  previewUrl: string | null;
}

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();

  // Senders
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState('');
  const [sendersLoading, setSendersLoading] = useState(true);
  const [creatingSender, setCreatingSender] = useState(false);

  // Message
  const [recipients, setRecipients] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [uploadSummary, setUploadSummary] = useState<RecipientParseResult | null>(null);
  const [uploadingList, setUploadingList] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Scheduling
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // One key per compose session: retries of the same submission are de-duplicated by the backend.
  const idempotencyKey = useRef(newIdempotencyKey());

  const listInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const closePopover = useCallback(() => setPopoverOpen(false), []);
  useClickOutside(actionsRef, closePopover, popoverOpen);

  const loadSenders = useCallback(async () => {
    setSendersLoading(true);
    try {
      const list = await senderService.list();
      setSenders(list);
      setSenderId((cur) => cur || list.find((s) => s.isActive)?.id || '');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load senders'));
    } finally {
      setSendersLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSenders();
  }, [loadSenders]);

  // Release object URLs for image previews.
  useEffect(
    () => () => attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectedSender = senders.find((s) => s.id === senderId);
  const validCount = useMemo(() => recipients.filter(isValidEmail).length, [recipients]);
  const invalidCount = recipients.length - validCount;

  // ---- Recipients ----------------------------------------------------------------------------
  const addRecipients = useCallback((emails: string[]) => {
    setRecipients((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const e of emails) {
        if (!seen.has(e)) {
          seen.add(e);
          next.push(e);
        }
      }
      return next;
    });
    setFormError(null);
  }, []);

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }, []);

  const onUploadList = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingList(true);
    try {
      const result = await emailService.parseRecipientFile(file);
      const before = new Set(recipients);
      const added = result.valid.filter((r) => !before.has(r)).length;
      addRecipients(result.valid);
      setRejected((prev) => [...new Set([...prev, ...result.invalid])]);
      setUploadSummary(result);
      if (result.validCount === 0) toast.error(`No valid email addresses found in ${result.filename}`);
      else toast.success(`Added ${added} recipient${added === 1 ? '' : 's'} from ${result.filename}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not read that file'));
    } finally {
      setUploadingList(false);
    }
  };

  // ---- Senders -------------------------------------------------------------------------------
  const createSender = async () => {
    setCreatingSender(true);
    try {
      const sender = await senderService.createEthereal(`Ethereal Sender ${senders.length + 1}`);
      await loadSenders();
      setSenderId(sender.id);
      toast.success(`Created Ethereal sender ${sender.email}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create sender'));
    } finally {
      setCreatingSender(false);
    }
  };

  // ---- Attachments ---------------------------------------------------------------------------
  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingFiles(true);
    try {
      const uploaded = await attachmentService.upload(files);
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((a, i) => ({
          ...a,
          previewUrl: files[i]?.type.startsWith('image/') ? URL.createObjectURL(files[i]!) : null,
        })),
      ]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Attachment upload failed'));
    } finally {
      setUploadingFiles(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // ---- Submit --------------------------------------------------------------------------------
  const validate = (): string | null => {
    if (!senderId) return 'Choose a sender in the From field.';
    if (validCount === 0) return 'Add at least one valid recipient.';
    if (invalidCount > 0) return `Remove ${invalidCount} invalid recipient${invalidCount === 1 ? '' : 's'} before scheduling.`;
    if (!subject.trim()) return 'Subject is required.';
    if (!bodyText && !/<img/i.test(bodyHtml)) return 'Email body is empty.';
    if (delaySeconds && (!/^\d+(\.\d+)?$/.test(delaySeconds) || Number(delaySeconds) > 86_400)) {
      return 'Delay must be a number of seconds (0 – 86400).';
    }
    if (hourlyLimit && (!/^\d+$/.test(hourlyLimit) || Number(hourlyLimit) < 1)) {
      return 'Hourly limit must be a whole number of at least 1.';
    }
    return null;
  };

  const openScheduler = () => {
    const problem = validate();
    setFormError(problem);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPopoverOpen((o) => !o);
  };

  const schedule = async (when: Date) => {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setStartAt(when);
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await emailService.schedule(
        {
          senderId,
          recipients: recipients.filter(isValidEmail),
          subject: subject.trim(),
          bodyHtml,
          startAt: when.toISOString(),
          delayMs: delaySeconds ? Math.round(Number(delaySeconds) * 1000) : null,
          hourlyLimit: hourlyLimit ? Number(hourlyLimit) : null,
          attachmentIds: attachments.map((a) => a.id),
        },
        idempotencyKey.current,
      );
      toast.success(
        result.duplicate
          ? 'This campaign was already scheduled — no duplicates created.'
          : `Scheduled ${result.scheduled} email${result.scheduled === 1 ? '' : 's'} starting ${formatPickerLabel(new Date(result.startAt))}`,
      );
      navigate('/scheduled');
    } catch (err) {
      // A definitive 4xx means nothing was created, so a corrected resubmission gets a fresh key.
      if (axios.isAxiosError(err) && err.response && err.response.status < 500) {
        idempotencyKey.current = newIdempotencyKey();
      }
      const message = getErrorMessage(err, 'Could not schedule emails');
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
      setPopoverOpen(false);
    }
  };

  const rowLabel = 'w-[60px] shrink-0 text-[12px] text-ink sm:w-[64px]';

  return (
    <div className="min-h-full bg-white">
      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'))}
          className="icon-btn shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-ink" />
        </button>
        <h1 className="flex-1 truncate text-lg text-ink sm:text-xl">Compose New Email</h1>

        <div ref={actionsRef} className="relative flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`icon-btn relative ${attachments.length ? 'text-brand' : ''}`}
            aria-label="Attach files"
            disabled={uploadingFiles}
          >
            {uploadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" strokeWidth={1.75} />}
            {attachments.length > 0 && (
              <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold text-ink">{attachments.length}</span>
            )}
          </button>
          <button type="button" onClick={openScheduler} className="icon-btn text-brand" aria-label="Pick send time">
            <Clock className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" onClick={openScheduler} disabled={submitting} className="btn-outline px-4 py-1 text-[12px]">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Send Later
          </button>
          {popoverOpen && (
            <SendLaterPopover
              initial={startAt}
              submitting={submitting}
              onCancel={() => setPopoverOpen(false)}
              onDone={(when) => void schedule(when)}
            />
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple hidden onChange={onPickFiles} />
      </header>

      <div className="mx-auto max-w-[790px] px-4 pb-16 sm:px-6">
        {/* From */}
        <div className="flex items-center gap-2 py-2.5">
          <span className={rowLabel}>From</span>
          <SenderSelect
            senders={senders}
            value={senderId}
            loading={sendersLoading}
            creating={creatingSender}
            onChange={setSenderId}
            onCreate={() => void createSender()}
          />
        </div>

        {/* To */}
        <div className="flex items-start gap-2 border-b border-line py-1.5">
          <span className={`${rowLabel} pt-2`}>To</span>
          <RecipientInput
            recipients={recipients}
            onAdd={addRecipients}
            onRemove={removeRecipient}
            onShowAll={() => setReviewOpen(true)}
          />
          <button
            type="button"
            onClick={() => listInputRef.current?.click()}
            disabled={uploadingList}
            className="flex shrink-0 items-center gap-1.5 pt-2 text-[13px] text-brand hover:underline disabled:opacity-60"
          >
            {uploadingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Upload List</span>
          </button>
          <input ref={listInputRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onUploadList} />
        </div>

        {(recipients.length > 0 || uploadSummary) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[68px] text-[11px] text-ink-muted sm:pl-[72px]">
            <span>
              <strong className="text-ink">{validCount}</strong> valid recipient{validCount === 1 ? '' : 's'}
            </span>
            {invalidCount > 0 && <span className="text-red-600">{invalidCount} invalid</span>}
            {uploadSummary && (
              <span>
                Last upload <em>{uploadSummary.filename}</em>: {uploadSummary.total} detected · {uploadSummary.validCount} valid ·{' '}
                {uploadSummary.invalidCount} invalid · {uploadSummary.duplicates} duplicates removed
              </span>
            )}
            <button type="button" onClick={() => setReviewOpen(true)} className="text-brand hover:underline">
              Review
            </button>
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2 border-b border-line py-2.5">
          <span className={rowLabel}>Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            maxLength={998}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          />
        </div>

        {/* Delay + hourly limit */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <label className="flex items-center gap-2 text-[12px] text-ink">
            Delay between 2 emails
            <input
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              placeholder="00"
              title="Seconds between two sends"
              aria-label="Delay between 2 emails in seconds"
              className="w-[52px] rounded-md border border-line px-2 py-1.5 text-[12px] outline-none placeholder:text-ink-faint focus:border-brand"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink">
            Hourly Limit
            <input
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="00"
              aria-label="Hourly limit"
              className="w-[52px] rounded-md border border-line px-2 py-1.5 text-[12px] outline-none placeholder:text-ink-faint focus:border-brand"
            />
          </label>
          {selectedSender && (
            <span className="text-[11px] text-ink-faint">
              Delay in seconds. Sender defaults: {(selectedSender.minDelayMs / 1000).toFixed(1)}s, {selectedSender.hourlyLimit}/hour
              (the stricter value wins).
            </span>
          )}
        </div>

        <RichTextEditor
          onChange={(html, text) => {
            setBodyHtml(html);
            setBodyText(text);
          }}
        />

        {attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {attachments.map((a) => (
              <div key={a.id} className="group relative w-[158px] overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex h-[88px] items-center justify-center bg-field">
                  {a.previewUrl ? (
                    <img src={a.previewUrl} alt={a.filename} className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-8 w-8 text-ink-faint" />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-[11px] text-ink">{a.filename}</p>
                  <p className="text-[10px] text-ink-faint">{formatBytes(a.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Remove ${a.filename}`}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-ink-muted opacity-100 shadow hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {formError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {formError}
          </p>
        )}
      </div>

      {reviewOpen && (
        <RecipientReviewModal
          recipients={recipients}
          rejected={rejected}
          onRemove={removeRecipient}
          onRemoveInvalid={() => setRecipients((prev) => prev.filter(isValidEmail))}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}
