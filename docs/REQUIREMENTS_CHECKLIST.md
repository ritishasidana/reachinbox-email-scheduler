# Requirements Checklist (final audit)

_Last updated: 2026-11-02. Local stack: Docker Postgres 16, Redis 7.4 with AOF, Elasticsearch 8.15.3._

Status legend:
- ✅ **verified**: exercised and the result observed (evidence column says how)
- 🟡 **implemented, not verified**: code exists and compiles; the behaviour has not been observed end to end
- ❌ **not done**

How things were verified:
- **API E2E (agent):** real HTTP calls to the running API. Before Google OAuth was configured, these used a test user with a correctly signed `express-session` cookie. Real Ethereal SMTP was used throughout.
- **Real user run (user):** the user logged in with their own Google account and drove the UI; results were checked server-side by the agent.
- **Manual UI (user):** features the user exercised in the browser and reported.
- **Code review (agent):** read and reasoned about, not observed in a browser (the agent had no browser access).

## Test totals
| Suite | Result |
|---|---|
| Backend unit + integration (`vitest`) | **28/28** passing (recipients, crypto, hour buckets, HTML sanitizer, Lua rate limiter on real Redis) |
| Backend typecheck / compile (`tsc`, `tsconfig.build.json`) | ✅ 0 errors; `dist/server.js` and `dist/worker.js` emitted |
| Frontend typecheck + production build (`npm run build`) | ✅ 0 errors |
| API E2E core suite | **40/40** |
| Restart and duplicate-send suite | **3/3** |
| SMTP failure suite | **7/7** |
| Concurrency suite (1 / 5 / 10) | **9/9** |
| Rate limit under contention (2 processes) | **5/5** |
| UI-facing API audit (search, filters, cancel, errors, authorization, sanitizer) | **21/21** (after the sanitizer fix) |
| Slack hourly-limit alert (real Slack) | **10/13** scripted checks; the 3 failures were wrong expectations in the script, not app bugs. With limit 1, the third email correctly defers to the hour after next (19:00 UTC); the due times re-read from BullMQ's delayed set are exactly 18:00:00 and 19:00:00 UTC |
| Slack final verification (OAuth, alert, reconnect, test message) | **9/9**, run after the reconnect at 22:57 IST and again after the final reconnect at 23:15 IST |

## Infrastructure
| Requirement | Status | Evidence |
|---|---|---|
| Docker Compose: Postgres, Redis, Elasticsearch | ✅ | All three containers healthy |
| Redis AOF + `noeviction` | ✅ | Delayed jobs survived `docker restart reachinbox-redis` (3 before, 3 after) |
| Prisma schema and migration | ✅ | `prisma migrate deploy` applied `20261102000000_init` |
| Environment validation and `.env.example` files | ✅ | App reports `googleConfigured` true/false correctly. Invalid env exits with a clear message (code review) |

## Authentication
| Requirement | Status | Evidence |
|---|---|---|
| Google OAuth 2.0 (code flow, server-side ID-token verification) | ✅ | Real user run: user logged in with their Google account and landed on the dashboard |
| User created or retrieved | ✅ | User row with name, email, Google ID and avatar |
| HTTP-only session cookie (Redis store) | ✅ | Redis session bound to the user, 7-day TTL, `HttpOnly`, `SameSite=Lax` |
| OAuth CSRF state, denied consent | ✅ | Forged state goes to `/login?error=invalid_state`; denied consent goes to `?error=access_denied` |
| Name, email and photo shown; logout | ✅ name/email/photo (user saw dashboard) · 🟡 logout | Logout not explicitly reported as tested |
| Unauthenticated access | ✅ | API returns 401; Bull Board redirects to login |
| Client secret never logged | ✅ | Fixed: the callback now logs only Google's error code; backend log scanned |

## Scheduling, queue and worker
| Requirement | Status | Evidence |
|---|---|---|
| Schedule API: one row and one delayed job per recipient | ✅ | API E2E and real user run |
| Future scheduling at the exact time | ✅ | Real user run: job due 1 ms after `scheduledAt`; worker started 71 ms after it |
| Ethereal delivery | ✅ | `250 Accepted`; preview page HTTP 200 contains the subject |
| SCHEDULED → SENT with `sentAt` | ✅ | Real user run |
| No cron; BullMQ delayed jobs; stable job IDs `email-<id>` | ✅ | Code review and job inspection |
| Separate queue and worker modules; standalone worker | ✅ | Concurrency and contention tests ran on `src/worker.ts` processes |
| `WORKER_CONCURRENCY` | ✅ | 1 → 0.21/s, 5 → 1.90/s, 10 → 3.56/s; peak in-flight equalled the setting |
| `MIN_EMAIL_DELAY_MS` spacing | ✅ | Gaps ≥ the configured delay in every run, including across 2 processes (2014–2028 ms) |
| Hourly limit per sender (Redis Lua, atomic) | ✅ | API E2E (3 of 5); manual UI (2 of 4 with Hourly Limit = 2); 2 processes (5 of 8, counter = 5) |
| Overflow rescheduled to the next hour, never failed, ordered | ✅ | Deferred to the next full hour, still `SCHEDULED`; Lua integration test checks ordering |
| No duplicate rate-limit reservations | ✅ | Lua integration test; counter equals the number sent under contention |
| Retries with exponential backoff | ✅ | Unreachable SMTP: gaps 10.1 / 20.1 / 40.1 / 80.1 s, FAILED after 5 attempts |
| Permanent errors not retried | ✅ | Wrong password: `535`, FAILED on attempt 1 |
| Safe state transitions | ✅ | Cancel-twice returns 409; cancelled jobs skipped (986/986); duplicate job for a sent email skipped |
| Idempotency-Key duplicate prevention | ✅ | Replay returns the original; 3 concurrent identical requests created 1 campaign |
| Restart survival | ✅ | Email due during downtime (API and Redis restarted) sent once after restart |
| No unnecessary re-sends | ✅ | Forced duplicate job returned `skipped: status-sent`; attempts unchanged |
| Exactly-once limitation documented | ✅ | README "Delivery semantics" |
| 1000+ emails at once | ✅ | 1000 scheduled in 446 ms; steady 1 per 2 s; 0 failed |

## Senders, attachments, search, Bull Board
| Requirement | Status | Evidence |
|---|---|---|
| Multiple senders; default sender on first login | ✅ | 2+ real Ethereal senders; auto-created at user's first login (SMTP login OK) |
| Sender isolation | ✅ | Sender B delivered while sender A was limited |
| SMTP credentials encrypted, never sent to the frontend | ✅ | AES-GCM `v1:` payloads; API responses contain no SMTP fields |
| Attachments (upload, send, preview, owner-only download) | ✅ | Manual UI: image attached, preview visible on detail page. API: cross-user download returns 404 |
| HTML sanitization | ✅ | Scripts, `javascript:` and (after fix) `data:` links stripped; formatting kept (unit tests) |
| Elasticsearch index and transactional outbox | ✅ | Outbox drained to 0; index created at startup |
| Full-text search | ✅ | Subject token, partial recipient, view-scoped; `source=elasticsearch` |
| Search fallback when Elasticsearch is down | 🟡 | Implemented (Postgres `ILIKE`); not exercised with Elasticsearch stopped |
| Bull Board, protected | ✅ | 200 when logged in; 302 to login when not |
| Cross-user isolation | ✅ | Other user's email, cancel and attachment all return 404 |

## Slack
| Requirement | Status | Evidence |
|---|---|---|
| OAuth v2 install flow (real Slack app, HTTPS redirect via ngrok) | ✅ | Real user runs (6 successful installs): connected to workspace "ReachInbox Scheduler", channel `#new-channel`, scopes `chat:write,chat:write.public,incoming-webhook`. The stored token passes Slack `auth.test`. `/api/slack/status` reports `configured: true, connected: true` |
| Token and webhook URL encrypted at rest | ✅ | DB row holds AES-GCM `v1:` payloads only; no `xox…` or `hooks.slack.com` plaintext |
| Signed, single-use OAuth state | ✅ | Unit tests, plus a real replayed callback (22:55:35 IST) rejected with "state was already used"; the following connects succeeded |
| Test notification | ✅ | User clicked **Test** after the first connect and saw the message; `POST /api/slack/test` returned 200 after the reconnect at 22:57:49 IST and again after the final reconnect at 23:15:28 IST |
| Real Slack message on hourly limit | ✅ | New sender with `hourlyLimit=1`, 3 `@example.com` recipients: 1 SENT, 2 SCHEDULED (deferred to 18:00 and 19:00 UTC, not failed), Redis counter = 1. **Exactly one** `RateLimitAlert` row (status `SENT`), one notification job (`ratelimit-<sender>-<hour>`, result `sent`), one "Rate-limit alert processed" log line |
| Alert quotes the limit that actually applied | ✅ | Fixed: previously quoted the sender's limit even when a lower campaign limit applied; now passes the applied limit with the alert job. Typecheck clean, 28/28 tests |
| Disconnect / reconnect | ✅ | Real user runs from the UI: 5 disconnect → reconnect cycles (22:56–22:57 and 23:13–23:15 IST). Each disconnect revoked the token at Slack (no revoke warnings or errors in the log) and deleted the row; each reconnect created a new row. After the final reconnect (23:15:28 IST): exactly 1 row, token valid at Slack (`auth.test`), status `connected: true`, test message accepted (HTTP 200) |
| Skip safely when not connected | ✅ | Alert recorded `SKIPPED`; sending unaffected |
| Not-configured state | ✅ | `/slack/status` reports `configured:false`; install returns 503; UI card says "not configured" |

## Frontend
| Feature | Status | Evidence |
|---|---|---|
| Login screen and Google login | ✅ | Real user run |
| Dashboard: sidebar, counts, Scheduled list with orange badge | ✅ | Real user run (user saw it) |
| Email detail: subject, sender, recipient, body, badge | ✅ | Real user run |
| Attachment preview on detail | ✅ | Manual UI |
| Compose: sender, To chips, subject, body editor, Send Later date picker | ✅ | Real user run |
| CSV upload, invalid detection, duplicate removal, counts | ✅ | Manual UI |
| "+N" chip and recipient review modal | ✅ | Manual UI |
| Custom delay and hourly limit | ✅ | Manual UI: 4 recipients, limit 2 → 2 sent, 2 scheduled |
| Sent list | ✅ | Real user run (API) and manual UI scheduling result |
| Search box | 🟡 UI · ✅ API | API audit passed; typing in the box not reported as tested |
| Filter menu (failed only, starred, by sender) | 🟡 UI · ✅ API | API audit passed; menu not reported as tested in the browser |
| Cancel (trash icon on detail page) | 🟡 UI · ✅ API | API audit passed; not clicked in the browser |
| Star toggle, Load more | 🟡 UI · ✅ API | API audit passed |
| Loading states | 🟡 code review | Present on lists, detail, session check, sender picker, buttons |
| Empty states | 🟡 code review · ✅ API | Variants for no data, no search match and filtered; no-match API returns `[]` |
| Error states | 🟡 code review · ✅ API | Backend-down now shows "Cannot reach the server" (fixed); 400/404 bodies verified |
| Mobile responsiveness | 🟡 code review only | Drawer sidebar under `md`, stacked rows, wrapping compose rows; not viewed on a phone or emulator |
| Visual match to Figma | 🟡 code review | Layout, colours and components follow the screenshots; deliberate deviations listed in README; not compared side by side |

## Assignment section 8 scenarios
| # | Scenario | Status |
|---|---|---|
| 1 | Single email | ✅ |
| 2 | Multiple emails | ✅ |
| 3 | Future time | ✅ |
| 4 | Ethereal delivery | ✅ |
| 5 | Minimum delay | ✅ |
| 6 | Hourly rate limit | ✅ |
| 7 | Rescheduling after the limit | ✅ |
| 8 | Sender isolation | ✅ |
| 9 | Worker concurrency | ✅ |
| 10 | Duplicate prevention | ✅ |
| 11 | Restart survival | ✅ |
| 12 | No unnecessary re-send | ✅ |
| 13 | Google OAuth | ✅ |
| 14 | Slack OAuth | ✅ |
| 15 | Actual Slack notification | ✅ (Slack API accepted the alert; user confirmation that it appeared in `#new-channel` is pending) |
| 16 | Slack disconnect/reconnect | ✅ |
| 17 | Elasticsearch indexing and search | ✅ |
| 18 | Bull Board | ✅ |
| 19 | Frontend loading, empty and error states | 🟡 code review and API-level only |

## Submission readiness
| Item | Status |
|---|---|
| `.gitignore` excludes `.env`, `node_modules`, `dist`, `backend/uploads` | ✅ reviewed; secret and personal-data scan of the other files found nothing |
| Git installed | ❌ not installed on this machine |
| First commit | ❌ blocked by Git |
| Private GitHub repository and push | ❌ needs Git and the user's confirmation |
