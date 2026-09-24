# SmileCare demo feature notes

## Admin access

The prototype does not have accounts/sessions/roles. All admin APIs (voice list, clone, preview, activation, deletion, language administration, and document administration) require `X-Admin-Key`, checked against backend `ADMIN_API_KEY`. Set it to a long random value in the deployment environment. The React admin page asks for the key and stores it in `sessionStorage` for the current browser session only. This is a coarse shared-key gate, not production authentication or a replacement for HTTPS, account identity, rate limiting, or audit logs. Public `/api/public-settings` and `/ws/audio` remain public.

## Voice library

Voice samples may be uploaded or recorded in the React admin page. Server limits labels to 100 characters and upload size to 20 MiB and allowlists audio MIME types. Voice labels and provider voice IDs are stored in SQL; activation is a single-active DB update. Provider failures do not create a mock voice. Deleting the only active voice is rejected. Audio preview is an authenticated request and speaks a short sample. Voice sample consent/rights must be obtained before uploading.

## Languages

`language_settings` rows are created on startup for English, Tamil, Mandarin, and Malay. English is enabled initially and remains required because the flow first asks for a language name spoken in English. The public settings API returns only enabled rows that are also configured as tested for both STT and TTS.

- `DEEPGRAM_SUPPORTED_LANGUAGES=en:en-US` lists tested Deepgram mappings. Add entries only after operators verify recognition for that language, e.g. `en:en-US,ta:ta`.
- `TESTED_TTS_LANGUAGES=en` is an operator-maintained list of language codes tested with the active ElevenLabs voice. This configuration is an assertion, not an automated provider certification.
- Admin can enable only codes present in both lists. Selection is spoken in English, then the WebSocket reconnects Deepgram using the mapped language. The AI is instructed to respond in the selected language; actual voice accent/pronunciation quality still requires human verification.

Do not add a language to either list without completing real provider tests. An active voice/provider outage may still make calls unavailable.

## Knowledge documents

Admin uploads are bounded to 2 MiB and stored in the SQL database with original bytes, filename, MIME type, extracted text, and status metadata. Supported inputs are UTF-8 `.txt` / `.md`, text-based `.pdf` via `pypdf`, and `.docx` via `python-docx`. Scanned/image-only PDFs and other formats are rejected. Extracted text is limited to 500,000 characters. A lightweight paragraph/token overlap retrieval selects up to four excerpts per user turn; no embeddings/vector index are used. Retrieved excerpts are marked untrusted in the system instructions to reduce prompt-injection impact, but this is not a hard security boundary. Review documents before use and do not upload secrets or unnecessary personal data. Database blobs are suitable only for a small prototype; configure durable DB backups and size limits in production.

## Caller flow and limits

The React caller page has no preference dropdown: it starts an audio call, speaks enabled language names, accepts a language name transcribed in English, then changes the Deepgram language mapping. Transcript is retained in the session call log. Unsupported/unclear language choices ask for a repeat. Browser microphone/network/provider failures are surfaced and stop local capture. Active voice is looked up server-side; the caller cannot choose an arbitrary provider voice ID.

The public WebSocket requires an exact `Origin` in `ALLOWED_ORIGINS` (comma-separated scheme/host/port; wildcard entries are not supported). Safe local defaults allow Vite at `localhost:5173` / `127.0.0.1:5173` and the Docker frontend at port `3010`. Deployments must set the frontend's actual origin(s). Calls are capped by `MAX_CALL_DURATION_SECONDS`, `MAX_CONCURRENT_SESSIONS_PER_IP`, `MAX_AUDIO_FRAME_BYTES`, `MAX_AUDIO_QUEUE_FRAMES`, `MAX_TRANSCRIPT_QUEUE_ITEMS`, and `MAX_TRANSCRIPT_ENTRIES`; overloaded/oversized sessions return an error and close with a relevant WebSocket code. The per-IP cap is process-local and uses the direct socket peer; if deploying behind a proxy, configure trusted proxy handling at the edge rather than trusting arbitrary forwarded headers.

Appointment availability remains a demo stub and is never authoritative. Appointment submissions validate a minimally plausible name/phone and ISO date/time, are stored as `Pending staff confirmation`, and must not be presented as booked or confirmed. Staff must verify availability and follow up. No outbound reminder/WhatsApp delivery is implemented. The obsolete reminder demo widget and its handler have been removed; the shared AudioWorklet processor remains in use.

## Deployment and transport

Set `DATABASE_URL` through a secret/environment injection mechanism; compose deliberately has no database credential and requires this value. Use the placeholder in `backend/.env.example` only as documentation and replace it in the runtime environment. The backend compose port is bound to loopback (`127.0.0.1:8010`) rather than published on all interfaces. Put a TLS-terminating reverse proxy/load balancer in front of externally reachable frontend and API traffic; configure the frontend with HTTPS/WSS URLs, forward WebSocket upgrades, and set `ALLOWED_ORIGINS` to the public frontend origin. Do not expose plaintext backend HTTP publicly. Provider/admin secrets should be injected securely and never committed.

## Setup and tests

Copy the documented values from `backend/.env.example` into the backend runtime environment (do not commit `.env`). For compose, export/inject `DATABASE_URL` and `ALLOWED_ORIGINS` before `docker compose up`; the database URL must be reachable from the backend container. Install `backend/requirements.txt`, then run backend tests from `backend/` with `python -m pytest`. Run React checks from `frontend-react/` with `npm run lint` and `npm run build`.
