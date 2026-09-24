# SmileCare AI Receptionist — MVP Product Brief

**Status:** Product proposal grounded in the current prototype  
**Audience:** Clinic stakeholders, product/design, engineering, and operations  
**Product:** A clinic-specific dental voice receptionist for the SmileCare clinic

> **How to read this brief:** “Observed prototype” describes behavior or data structures present in the source reviewed. “Recommended MVP” describes product scope to build or verify; it is not a claim that the prototype already provides it. Defaults marked **Assumption / proposal** are working decisions for planning and require clinic confirmation before launch.

## 1. Executive summary

SmileCare AI Receptionist is intended to answer routine clinic questions and help callers request or book dental appointments through a browser-based voice conversation. Clinic staff should be able to maintain the information the assistant uses, choose its speaking voice, review appointments and conversation records, and control operational settings through an authenticated admin experience.

The prototype demonstrates a voice conversation loop: browser microphone audio is streamed to a backend, speech is transcribed, an AI service generates a response using clinic data and tool calling, and a text-to-speech service returns spoken audio. It also has seeded doctors, services and FAQs; voice-profile controls; conversation transcript/session logging; and an appointment persistence model/insert path. The React demo now includes a configurable shared-key admin gate, DB-backed language availability and text-based knowledge document handling. These remain prototype controls, not launch-ready accounts. Appointment availability remains mocked; no outbound reminders are delivered. English is the default language. Additional languages are not effective unless operators explicitly mark/test both Deepgram recognition and ElevenLabs voice output.

**Recommended MVP:** Deliver one clinic’s public, unauthenticated voice widget and a secure, authenticated staff dashboard. Make appointment booking truthful by using configured clinic hours and a simple slot/availability policy—or treat requests as pending for staff confirmation until that policy is implemented. Include minimum viable administration for staff access, clinic content, voice, settings, appointments, call logs, and operational health. Do not require a patient account.

## 2. Product purpose, users, and value

### Purpose

Provide a convenient first point of contact for SmileCare callers: answer approved, routine questions; collect appointment details; accurately explain whether a requested appointment is confirmed or awaiting staff review; and give callers a clear route to a person when the AI cannot help.

### Target users and personas

| Persona | Need | MVP relationship to product |
|---|---|---|
| **Caller / prospective or existing patient** | Ask about services, clinic logistics, or request an appointment without waiting for staff or creating an account. | Public, unauthenticated user of the voice widget. May optionally use a typed fallback if included in launch design. |
| **Clinic owner / administrator** | Set up the clinic, control staff access, review activity, and ensure answers and booking rules are correct. | Authenticated admin with account and settings permissions. |
| **Receptionist / clinic staff** | Review appointments and calls, correct clinic information, and follow up on requests needing human action. | Authenticated staff account with limited operational access; may be the same person as owner in the initial single-clinic deployment. |
| **Product / technical operator** | Keep integrations and the service healthy, protect credentials, and investigate system failures. | Restricted operational access outside routine clinic content and patient workflows. Do not expose provider secrets in the clinic UI. |

### Core problem

Calls asking repeatable questions and requesting appointments take staff time, can arrive outside staffed hours, and may be missed. A voice-first assistant can reduce routine handling, but only if its answers are clinic-approved, its appointment status is honest, and failures transfer callers to a workable human path.

### Value proposition

- **For callers:** A conversational, always-available way to ask common questions and start an appointment request.
- **For staff:** Fewer repetitive enquiries and a consistent queue of appointment requests and conversations to review.
- **For the clinic:** A controllable assistant grounded in clinic-maintained information, with visible activity and clear boundaries around automation.

### Goals

1. Let an unauthenticated caller start and end a voice session and see/hear the conversation state.
2. Answer common questions using only current, clinic-approved data; ask a human when the answer is missing or uncertain.
3. Collect the minimum appointment details and distinguish **confirmed** from **pending staff confirmation**.
4. Give clinic staff authenticated, auditable access to manage users, voice, content, booking rules, appointments, and call records.
5. Give staff and callers understandable success, validation, and recovery feedback.
6. Avoid representing language, messaging, availability, or integrations as supported before they work end to end.

### Non-goals for the first MVP

- Patient sign-up, patient dashboard, or patient account/history access.
- Multi-clinic tenancy, clinic switching, or complex franchise configuration.
- Diagnosis, treatment recommendations, emergency triage, or replacing clinical judgment.
- Guaranteed real-time synchronization with an external practice-management system unless separately integrated and tested.
- Automated outbound calls, SMS, WhatsApp, or email before a delivery provider, consent policy, templates, and delivery monitoring are configured.
- Broad analytics, custom report builders, advanced role hierarchies, or enterprise identity federation.
- Advertising the five UI language choices as fully supported until recognition, response generation, speech output, and clinic content have each been validated for those languages.

## 3. Prototype reality versus recommended MVP

| Area | Observed in the prototype | Recommended MVP treatment |
|---|---|---|
| Public voice experience | React caller page offers start/end, live transcript, and an audio-session flow that asks the caller to speak an enabled language name. Browser mic audio is streamed over WebSocket. | Public access remains unauthenticated. English-only by default; operator-tested extra languages may be exposed. The prototype does not implement a full consent/legal notice or production human handoff. |
| Speech and response | Backend uses Deepgram speech recognition, OpenAI-compatible response/tool calling, and ElevenLabs speech/voice-clone services. Recognition is hard-coded to English despite the UI choices. | Treat English as the only supported launch language by default; show honest language availability. Protect and monitor third-party service credentials and handle provider outages. |
| Clinic knowledge | Doctors, services, and FAQs are seeded in the database. | Add authenticated CRUD and validation. Staff must confirm seeded information before it becomes live. The assistant may answer only from approved data and must defer when information is absent. |
| Appointments | Appointment records can be inserted; the model stores name, phone, date, time, status, and creation time. Availability is mocked. | Add a defined clinic-hours/slot policy and duplicate/conflict prevention before labeling a booking “confirmed.” Until reliable capacity is available, record the request as **pending staff confirmation** and tell the caller so. |
| Conversation history | Session call logs with transcript and timing are persisted. | Add secure staff-only list/detail access, filtering, retention, and deletion policy. Do not store raw audio by default. |
| Voice administration | React admin can record/upload a bounded sample, clone, list, preview, activate, and delete DB-backed profiles. All these API routes require the shared admin key; one active profile is maintained transactionally. Provider clone failures no longer fake success. | Shared key is a prototype gate, not staff authentication. Obtain speaker permission and deploy real identity, rate limiting, audit and transport protections before production. |
| Reminders | Mock outbound reminder widget has been removed; there is no delivery provider. | No outbound messaging by default. |
| Accounts and access | No account signup or role-based identity. Admin APIs use a configurable shared key; public caller socket/settings are intentionally public. | Add staff accounts, session security, role checks, rate limiting, auditing, and HTTPS before real clinic data is exposed. Callers do not sign up. |
| Content, settings, reports | Language settings and a small document knowledge store are managed in React admin. Text/TXT/MD, extractable PDF and DOCX uploads are supported; documents are lexically retrieved into assistant context. No general clinic content CRUD or report/log UI is provided. | Treat uploaded content as untrusted and review it. Document blobs/retrieval are prototype-scale; defer advanced analytics and multi-clinic settings. |
| Deployment surfaces | React frontend is the served application; standalone HTML pages are legacy/demo. | Treat React as the supported product interface; do not present legacy/demo pages as separate product dashboards. |

## 4. Assumption ledger and proposed defaults

These are working defaults, not verified clinic policy. The clinic owner must approve or replace them during onboarding.

| ID | Assumption / proposed default | Decision required before production |
|---|---|---|
| A1 | **Single clinic:** SmileCare only; one clinic configuration and one shared operational dataset. No multi-tenant product model in MVP. | Confirm the clinic identity and that one deployment serves one clinic. |
| A2 | **Clinic time zone:** `Asia/Kolkata` (India Standard Time), consistent with seeded INR pricing and current product context. Store timestamps consistently and display appointment times in this clinic zone. | Confirm the physical clinic’s time zone and daylight-saving behavior if applicable. |
| A3 | **Languages:** English is the initial supported voice language. Other choices remain hidden or marked unavailable until end-to-end tests show acceptable recognition and speech in each language. | Approve supported languages, translations, and fallback wording. |
| A4 | **Clinic hours:** Staff enters regular opening days/hours, holidays/closures, and the time zone. The assistant never invents hours. | Clinic supplies current hours, holiday policy, and human contact route. |
| A5 | **Appointment slots:** Use a simple configurable default of 30-minute slots, at least 24 hours’ notice, and a rolling 30-day booking window. The clinic may override slot length/notice/window. No provider/room capacity integration is assumed. | Confirm service durations, booking horizon, notice period, capacity, and whether staff must approve every request. |
| A6 | **Confirmation rule:** A record is “confirmed” only after the MVP has checked an eligible, unclaimed slot and saved it successfully. Otherwise it is “pending” and the caller is told staff will follow up. | Approve which booking mode is operationally safe. |
| A7 | **Reminder policy:** No outbound reminder is sent in the default MVP. If later configured, start with one opt-in reminder 24 hours before the appointment by an enabled provider; log delivery outcome and honor opt-out. | Choose channels, opt-in wording, timing, templates, and provider. |
| A8 | **Patient accounts:** None. Callers access the public widget without signup, password, or patient dashboard. | Confirm no patient portal requirement for MVP. |
| A9 | **Staff accounts:** Clinic owner invites staff; one owner account is required. Staff access is authenticated and role-limited. No open public admin registration. | Name account owner and staff who need access. |
| A10 | **Transcript privacy:** Explain before microphone use that audio is streamed to speech/AI providers and a text transcript may be stored for clinic operations. Do not persist raw audio by default. Require a clear consent action before starting; offer a non-voice contact route if consent is declined. | Legal/privacy review must approve notice, provider terms, access policy, and applicable retention requirements. |
| A11 | **Retention:** Retain transcript/call records for 30 days by default, then delete or de-identify automatically unless the clinic sets an approved shorter period. Keep appointment data only for the clinic-approved operational period. | Confirm retention and deletion obligations with the clinic and applicable counsel. |
| A12 | **Human support:** The widget uses clinic-provided phone/contact details and opening hours; it does not promise live transfer unless telephony integration is actually enabled. | Supply support contact and define escalation responsibility. |
| A13 | **Medical safety:** The assistant gives administrative information only, does not diagnose, and directs urgent symptoms to emergency services/clinic staff using clinic-approved wording. | Approve safety and emergency copy with a qualified clinic representative. |
| A14 | **Message delivery:** A generated message in the prototype is not proof of delivery. “Sent” is displayed only when an integrated provider returns success and the event is recorded. | Configure provider, credentials, consent and delivery semantics before enabling messaging. |

## 5. Recommended MVP product surfaces and feature catalog

The tables below describe **recommended MVP** behavior. Observed prototype behavior is separately captured in Section 3. Validation and failure behavior are specified as part of the product contract, even where the current prototype has no corresponding surface.

### 5.1 Public caller / patient-facing voice interface

| Feature | Purpose and behavior | Actor / access | Interaction | Validations | Error states and recovery | Success state |
|---|---|---|---|---|---|---|
| Welcome, clinic identity, and consent | Set expectations, identify SmileCare, disclose voice processing/transcript handling, and establish that the assistant is not a clinician. | Public caller; no account. | Caller opens clinic widget/page, reads notice, and selects **Agree and start** or declines. | Consent must be explicit before requesting mic permission/streaming; notice links to privacy information. | Consent declined: do not open mic; show clinic phone/contact and hours. Notice unavailable: fail closed for voice and provide contact route. | Consent timestamp/version is associated with the session; caller can proceed. |
| Microphone permission and voice session | Capture speech and return spoken responses with visible listening/thinking/speaking/ended states. | Public caller; browser/device permission required. | Caller starts, speaks, may interrupt assistant speech, and ends the session. | Secure browser context and supported microphone; prevent a second active session from starting in the same view. | Permission denied/device absent/network/provider outage: plain explanation, retry, and non-voice contact option; do not leave the mic active. | Connection and mic state are clear; caller can hear and see the exchange. |
| Language selection | Offer only fully supported languages; current prototype’s five choices are not proof of complete speech support. | Public caller. | Select an available language before starting. | Disable changes during a live session; language must be enabled by product configuration and validated end to end. | Unsupported choice is hidden or labeled unavailable, not silently processed as English. | Conversation uses the selected supported language, or the UI accurately identifies English-only service. |
| Live transcript and controls | Let caller follow the conversation, understand interim recognition, stop or restart, and clear local display where appropriate. | Public caller. | Review transcript; stop session; clear transcript display. | Clearly distinguish interim text from final text; confirm before clearing if local history would be lost. | Transcript stream interruption: show connection warning and do not imply the assistant heard the statement. | Messages appear in order with speaker labels and a visible session state. |
| Routine clinic FAQs | Answer services, clinician, location/hours, pricing ranges, insurance, and visit-preparation questions from approved clinic records. | Public caller. | Ask in natural language; assistant responds by voice and transcript. | Use active, approved content only. Never invent exact fees, eligibility, clinician availability, or medical advice. | Unknown/ambiguous answer: say it cannot confirm and offer clinic contact/human follow-up. Provider failure: apologize and offer retry/contact. | Answer is consistent with approved data and caller can continue or request help. |
| Appointment request and booking | Gather contact details, appointment reason/service, preferred clinician if relevant, preferred date/time, and explicit confirmation of details. | Public caller; no signup. | Assistant asks one question at a time; summarizes information; caller corrects or confirms. | Name required; phone normalized and checked for plausibility; date/time must be future, in clinic time zone and within booking window; service/doctor must be active. Collect only necessary data. | Recognition uncertainty: repeat/confirm; invalid time: request another; no slot: offer alternatives or pending request; save/API failure: do not claim booked and show contact route. | Persisted eligible slot is confirmed only after successful save; otherwise persisted as pending and caller hears the correct status. A reference identifier may be read/displayed if implemented. |
| Appointment confirmation | Close the loop with date, local time, clinic identity, and status. | Public caller. | Caller hears/reads a summary and confirms or corrects. | Repeat phone/date/time; do not announce confirmation until authoritative save result. | Save conflict or timeout: say the status is uncertain/pending, do not promise a booking, and direct to staff. | Explicit **confirmed** or **pending staff confirmation** status and next step. |
| Notifications and follow-up | Explain how appointment details will be communicated and whether any reminder will be sent. | Public caller; consent where a channel requires it. | Caller may opt into an enabled reminder channel; MVP default has no outbound notifications. | Validate contact/channel and record required opt-in; never infer consent from booking. | No provider/config/consent: state no reminder will be sent and ask caller to retain the details/contact clinic. Provider rejection: record failure and do not say delivered. | Accurate message status only; caller has appointment details in the live conversation and any promised channel is actually enabled. |
| Human support and safety fallback | Provide a clear human route for unresolved questions, accessibility needs, urgent concern, or voice failure. | Public caller. | Ask for staff, decline voice, or indicate urgent concern. | Use only clinic-approved contact/hours and safety text. | No live staff available: state callback/contact process without promising a transfer. Emergency language: do not triage; provide approved emergency direction. | Caller receives an understandable next action without unsafe clinical assurance. |
| End session and privacy | Stop capture, close the session, and explain what is retained. | Public caller. | Select **End session**; optionally start a new session. | Stop audio capture immediately; prevent further transmission after end. | Disconnect failure: retry closure locally, stop microphone tracks, and present a visible ended state. | Session ends; transcript retention follows the disclosed policy. |

### 5.2 Clinic administrator and staff dashboard

**Access baseline:** Every dashboard route and API must require an authenticated clinic staff account. Unauthorized users are redirected to sign-in or receive an access-denied state. The existing admin page is not an authentication boundary.

| Dashboard / feature | Purpose and behavior | Actor / access | Interaction | Validations | Error states and recovery | Success state |
|---|---|---|---|---|---|---|
| Sign-in, recovery, and account profile | Secure entry for clinic staff; allow password reset and profile/session management. | Invited owner/staff; no public admin signup. | Sign in with email/password; request a time-limited reset; sign out. | Valid email/password; rate-limit attempts; enforce password rules and reset expiry. | Invalid credentials, expired link, locked/rate-limited attempt, or service unavailable: safe message, retry/reset path; never disclose whether an email is registered. | Authenticated user sees only permitted clinic dashboard pages; sign-out invalidates session. |
| Clinic onboarding / setup checklist | Make a new clinic account operational and prevent unreviewed seeded/demo data from going live. | Owner; staff may view completion status. | Confirm clinic identity/time zone/contact, hours, services, dentists, FAQs, booking mode, privacy notice, voice and test call; publish when ready. | Required setup fields; contact and time zone valid; content reviewed; hours coherent; booking mode selected; voice/provider healthy. | Incomplete step identifies exactly what is missing; integration failure blocks activation of dependent feature. | Readiness checklist is complete and clinic owner explicitly activates public assistant. |
| Overview | Surface near-term appointments, pending requests, recent calls, and service health with links to action. | Owner and staff; summary data appropriate to role. | Open dashboard; click a count to its filtered list. | Counts and timestamps derive from saved records and configured time zone. | Empty state is distinct from load failure; stale data timestamp shown if refresh fails. | Current summary renders with last-updated time and actionable navigation. |
| Staff and access management | Create/invite, deactivate, and reset staff access; prevent unauthorized data access. | Owner manages users; staff cannot manage accounts. | Owner invites by email, assigns owner/staff role, resends/revokes invitation, deactivates account. | Unique normalized email; allowed role; invitation expiry; last active owner cannot be removed/demoted without replacement. | Duplicate invite, expired invite, mail failure, unauthorized action: explain, allow retry or owner recovery path; audit security events. | Invitee sets credentials and enters authorized dashboard; deactivated account loses access. |
| Appointments | Review confirmed bookings and pending requests; update status, contact caller, cancel/reschedule with a reason. | Owner/staff. | Filter/search by date/status/name/phone; open detail; confirm pending request, mark contacted/cancelled, or edit/reschedule. | Date/time valid in clinic zone; avoid duplicate slot conflicts; required status/reason; phone changes checked. | Conflict, stale record, missing record, or save failure: keep old value, show current state, offer refresh/retry; do not silently overwrite. | Updated record and actor/time/reason are recorded; status change is visible to relevant staff. |
| Voice library and active voice | Manage the assistant’s spoken identity. | Owner; staff permission configurable, default owner-only for clone/delete. | Upload or record sample; name it; preview; activate; delete. | Allowed audio types, safe size/duration limits, non-empty name, documented right/consent to clone the speaker; preserve one usable active voice. | Mic denied, invalid sample, provider/quota failure, preview unavailable, or delete conflict: clear error and keep current active voice unchanged. | Profile is saved, previewed, and explicitly active; active voice is shown to staff. |
| Clinic content: dentists, services, FAQs | Keep the assistant’s knowledge accurate and auditable. | Owner/staff with content permission. | Create/edit/deactivate dentist, service, FAQ; preview or test representative questions; publish changes. | Required names/answers; bounded text; valid working days/fees; no unsupported medical promises; edits require review/publish. | Validation error identifies field; save conflict/service outage preserves draft and current live data. | Published version is available to assistant; editor, timestamp, and changed fields are recorded. |
| Clinic settings and booking rules | Control identity, hours, contact route, language, slot rules, consent wording, retention, and notification availability. | Owner only for sensitive settings; staff may view relevant values. | Edit settings and save/publish; run a test or preview before applying changes. | Time zone required; hours/closures consistent; slot length and booking horizon positive; only verified language/provider options enabled. | Invalid combination or unsupported integration blocks save; warn before a change affects public experience. | Versioned settings take effect and are shown with effective time. |
| Reports and call/appointment logs | Support daily operations and review how the assistant handled interactions. | Owner/staff, restricted to clinic; sensitive transcript permissions can be owner-only. | Search/filter calls and appointments by date/status; open transcript; export only if approved; delete under retention policy. | Date range bounded; exports authorized and logged; redact or avoid unnecessary personal data. | Empty result, expired/deleted record, or export failure communicated distinctly; no access leakage. | Authorized users see accurate records and timestamps; export/delete actions are auditable. |
| Operations and integration health | Make speech, AI, TTS, database, and notification-provider status visible without exposing credentials. | Owner sees clinic-facing state; restricted operator handles secrets and diagnostics. | View integration status, last successful call, error category, and test connection; retry safe checks. | Secret values never returned to browser; status reflects actual health checks, not merely configured keys. | Provider unavailable/credentials invalid/database failure: mark impacted capability degraded and show caller fallback; avoid retry storms. | Health state and timestamp update; no false claim that a reminder or appointment completed. |
| Support and help | Give staff escalation instructions, known limitations, and a channel to report issues. | Owner/staff. | Open help and copy a non-sensitive diagnostic/session reference when reporting a failure. | Do not place transcript/phone or secret material into unprotected support channels. | Help service unavailable: show static guidance and configured operator contact. | Staff knows whether to retry, handle manually, or contact technical support. |

## 6. End-to-end recommended experiences

### 6.1 Clinic owner account creation and clinic onboarding

1. **Provisioning:** An authorized SmileCare owner receives a time-limited invitation; public visitors cannot create an admin account. The owner sets credentials and verifies the account email. **This is proposed; no account system currently exists.**
2. **Secure entry:** Owner signs in over a secure connection, sees the single-clinic setup checklist, and is assigned the owner role.
3. **Clinic identity:** Owner confirms display name, clinic contact number, address if displayed, contact hours, time zone, and human escalation wording.
4. **Business rules:** Owner enters opening hours/closures, supported language (English by default), appointment window, notice period, slot length, and booking mode (confirmed slot vs staff-confirmation request). Owner verifies provider configuration and no-reminder default.
5. **Knowledge review:** Owner reviews seeded dentists, services, price ranges and FAQs; edits or deactivates incorrect/demo information; publishes only accurate answers.
6. **Voice setup:** Owner uses an approved voice or uploads/records a sample for which the clinic has permission, previews it, and activates it. Failure leaves the existing voice unchanged.
7. **Privacy and readiness:** Owner reviews consent and transcript-retention notice, confirms support contacts, runs a test conversation and a test appointment path, then explicitly activates the public widget.
8. **Incomplete setup:** Public voice and booking capabilities remain disabled or clearly limited until required settings/data are valid. Staff can still access setup and help.

### 6.2 Staff onboarding and access

1. Owner invites each staff member with the minimum role required.
2. Invitee uses an expiring link to set credentials; invitation acceptance is recorded.
3. Staff signs in and sees only dashboard sections allowed by role. No patient-facing user creates an account.
4. Owner can revoke access promptly; offboarded accounts cannot continue using active sessions. Owner recovery is available if a staff member leaves.

### 6.3 Caller voice workflow and appointment handling

1. Caller opens the clinic widget/page; it identifies SmileCare, indicates supported language, and presents privacy/processing notice.
2. Caller consents, grants browser microphone access, and starts a session. If either step fails or caller declines, show a clinic contact route.
3. Assistant greets caller, handles approved FAQ, and asks a human when uncertain. It does not diagnose or invent clinic facts.
4. If caller wants an appointment, assistant collects only name, callback phone, requested service/reason, preferred clinician where relevant, and preferred date/time. It reads the collected details back.
5. Booking logic checks future date, configured hours, notice/window, eligible slot, and conflict using the configured MVP policy. A successful atomic save is required before confirmation.
6. If a slot is eligible and saved, caller is told the appointment is **confirmed** with local date/time. If availability cannot be verified, caller is told the request is **pending staff confirmation**—not booked—and staff receive a pending item. If save fails, caller is not told either status as completed; assistant offers the human contact path.
7. Session transcript/log is saved under the retention policy; no raw audio is retained by default. Caller ends session; capture stops.
8. No email/SMS/WhatsApp/call reminder is promised or sent by default. If a provider is later configured, only a consented message with a recorded provider outcome may be described as sent/delivered.

### 6.4 Staff appointment follow-up and confirmation

1. Receptionist opens pending requests sorted by requested date/time, checks clinic capacity and contact details, and contacts caller using clinic procedures.
2. Staff confirms a slot, offers an alternative, or marks the request unable to fulfill; each outcome and responsible staff/time is recorded.
3. Any change to a confirmed appointment checks conflicts and preserves an audit trail. Caller receives no automatic update unless an explicitly enabled, consented delivery channel succeeds.
4. Staff can filter upcoming appointments, pending requests, cancellations, and records needing follow-up.

### 6.5 Notifications

- **Default MVP:** No outbound reminder provider; no automated outbound reminder calls. Confirmation is conveyed in the voice session, and staff can follow up manually.
- **Future/optional activation:** Configure provider credentials outside the clinic-facing UI, approved templates, sender identity, opt-in/opt-out handling, send window and delivery callbacks. Show “queued,” “sent,” “delivered,” or “failed” only when supported by provider events; record each attempt. Failed delivery does not invalidate a saved appointment and should create a staff-visible issue.

### 6.6 Support and account management

- **Caller support:** A persistent option provides clinic phone/contact and hours. No live transfer is implied without a working transfer integration. Urgent clinical concerns receive clinic-approved emergency direction, not AI triage.
- **Staff support:** Dashboard help explains known limitations and operational recovery (e.g., retry provider, take request manually). Staff can submit a sanitized session reference.
- **Staff account management:** Owner invites, changes roles, deactivates, and restores access through authenticated controls. Each security-sensitive action is logged. Staff can update their own profile/password and sign out.
- **Patient account management:** Not applicable in MVP because public callers do not have accounts. Caller transcript access or self-service account deletion is not offered; provide a privacy contact route for data requests.

## 7. Components, data, and actions in plain language

### Main components

1. **React public widget:** Displays consent, supported language, voice controls, conversation status, transcript, and caller fallback information.
2. **React clinic dashboard:** Presents secure staff workflows for setup, access, appointments, content, voice, reports, and service status.
3. **Application backend:** Authenticates staff, enforces permissions, applies clinic rules, saves records, and coordinates voice and administration requests.
4. **Speech and AI providers:** Deepgram turns microphone audio into text; an OpenAI-compatible model produces a response and may request a structured action; ElevenLabs creates spoken audio and supports the prototype’s voice cloning. These are external providers and can fail independently.
5. **Database:** Stores clinic knowledge, voice profiles, call sessions/transcripts, appointments, and (recommended) staff accounts, clinic settings, consent records, and audit events.
6. **Optional notification provider:** Not present as a delivery integration in the observed prototype. It is added only if the clinic enables outbound notifications.

### Data/action relationship

| Data record | Created/changed by | Used for | Access and safety |
|---|---|---|---|
| Clinic settings and hours (**recommended**) | Owner in dashboard | Public identity, hours, booking policy, supported language, privacy/help text | Owner edit; staff read as needed; version changes. |
| Dentist / service / FAQ | Staff with content permission | AI context for approved clinic answers and relevant appointment capture | Staff edit; only published data is used; no unsupported clinical advice. |
| Voice profile | Owner or authorized staff | Selects voice used for speech synthesis | Provider identifier is backend-only; sample audio is sensitive and not retained unless needed/approved. |
| Call log and transcript | Backend during voice session | Staff review, support, quality monitoring | Contains potentially identifying/personal information; authenticated access, retention and deletion required. |
| Appointment | Assistant request flow and staff review | Booking, follow-up, appointment list | Contains name and phone; status must reflect verified booking result; restrict access and log changes. |
| Staff account and role (**recommended**) | Owner/invitation workflow | Sign-in and authorization | Never public; secure password/session handling; role checks on backend/API, not just UI. |
| Consent and audit record (**recommended**) | Caller consent; staff actions | Demonstrate disclosed processing and trace administrative changes | Minimal data, restricted access, protected from ordinary editing. |
| Delivery attempt (**optional**) | Notification service | Track reminder/message progress | Store channel, consent basis, timestamp, provider status/reference; never store provider secrets in client. |

### Typical voice-to-appointment action path

`Caller microphone → secure voice connection → speech recognition → transcript → AI response grounded in published clinic data → (optional) validated appointment action → database save/result → spoken/text confirmation → session transcript record`

An AI response is not itself a database confirmation. The application must validate the requested action, perform the write, and use the resulting status in its response. If validation or persistence fails, the assistant must say so and give the caller a safe next step.

## 8. Permissions model

| Capability | Public caller | Staff | Clinic owner | Restricted technical operator |
|---|---:|---:|---:|---:|
| Start a public voice session and submit an appointment request | Yes, without signup | Yes, only as public test or through an explicitly authorized preview | Yes | Yes, for testing only |
| View or manage their own patient account | Not applicable; no patient account | No | No | No |
| View appointment records | Only details just given in the current interaction | Yes, clinic-wide minimum needed | Yes | Only if operationally necessary and authorized |
| View transcripts/call logs | No persistent history access | Limited; transcript access may be owner-only by default | Yes | Sanitized diagnostics by default; content access requires approval |
| Edit clinic content/hours | No | Yes, if permission granted | Yes | No routine content access |
| Invite/deactivate staff or change roles | No | No | Yes | No, except controlled recovery procedure |
| Clone/delete/activate voices | No | Owner-only by default; owner may grant | Yes | No routine use |
| Configure secrets/integrations | No | No | View status, not secret values | Yes, via secure deployment/secret management |
| Export/delete records or change retention | No | Only if expressly authorized | Yes, subject to policy | Operational support only with approval/audit |

**Authorization requirements:** Enforce access on every protected backend route and data operation, not only by hiding dashboard controls. Use secure transport, secure password/session practices, rate limits on public and authentication endpoints, audit sensitive actions, and avoid leaking whether staff accounts exist. Owner access must not be accidentally removed when another user is deactivated.

## 9. Data privacy, security, and failure handling

### Data minimization and transparency

- Before a caller begins, disclose that microphone audio is sent to external speech/AI services and explain whether text transcripts are retained and for how long.
- Capture explicit consent and a notice version/time before starting audio. Do not start streaming if consent is declined.
- Do not retain raw audio in the MVP unless a separately justified, reviewed feature requires it. Keep only the data needed for appointment operations and disclosed transcript review.
- Do not ask for payment-card data, passwords, full medical history, or unnecessary clinical details in voice. Warn callers not to share sensitive medical information beyond what staff needs to route the request.
- Restrict appointments, transcripts, staff records, and exports to authenticated, authorized clinic users. Use the clinic-approved retention and deletion policy; the proposed default is 30 days for transcripts.
- Treat provider keys, voice-provider identifiers, and diagnostics as server-side operational data. Never expose secrets in frontend bundles, browser responses, or logs.
- Review external provider data handling, regional processing, contractual terms, and applicable privacy/legal obligations before production. This brief is product guidance, not legal advice.

### Failure behavior principles

1. **Be truthful:** Never say “booked,” “sent,” “saved,” or “connected” until the corresponding operation/provider confirms success.
2. **Preserve caller safety:** For uncertain recognition, ask the caller to repeat or confirm; for uncertainty or medical questions, route to a person.
3. **Fail closed for sensitive actions:** If authentication, consent, authorization, slot validation, or persistence cannot be verified, do not perform or claim the sensitive action.
4. **Provide a next step:** Retry when safe, show service degradation, or provide clinic contact details and hours. Do not trap a caller in an unavailable voice session.
5. **Avoid duplicate effects:** Appointment saves and notification retries should be idempotent or detect duplicates; a network timeout must not create multiple bookings or reminders.
6. **Keep an operational record:** Log failure category, time, and safe correlation/session reference. Avoid logging raw audio, secrets, or unnecessary transcript contents.

### Failure matrix

| Failure | Caller-facing behavior | Staff/operations behavior |
|---|---|---|
| Browser microphone unavailable/permission denied | Explain how to retry; offer clinic contact route; no audio sent. | No call record should imply a successful conversation; record a safe setup error only if available. |
| WebSocket/network drops | Show disconnected/retry state; stop mic; do not claim last utterance was processed. | Capture sanitized technical event and time; display degraded state if widespread. |
| Speech recognition fails or language unsupported | Ask caller to repeat in supported language or use human contact. | Keep language support status accurate; alert operator if provider errors are sustained. |
| AI provider fails or returns uncertain answer | Apologize, avoid inventing, offer contact/retry; appointment write is not implied. | Record failure category and session reference; allow staff to review partial session if saved. |
| Text-to-speech fails | Keep text response visible where available; offer typed/human route. | Mark voice output degraded; do not claim the caller heard confirmation. |
| Slot unavailable/conflict | Offer another eligible time or record a pending request; do not assert booking. | Pending item is visible; staff can resolve and contact caller. |
| Database write fails or times out | Explain that status could not be confirmed; give contact route; do not claim success. | Alert/monitor database error; use idempotent retry/reconciliation. |
| Voice clone/preview/delete provider failure | Preserve currently active voice; show specific retry guidance. | Record provider error category; credentials/quota managed securely. |
| Reminder provider absent/failed | State no reminder was sent; caller retains in-session booking details. | No “sent” status; show failed attempt only if a real provider attempt occurred. |
| Unauthorized dashboard/API request | No protected data disclosed; direct user to sign in or request owner access. | Audit denied security-sensitive attempts with limited metadata. |

## 10. Recommended MVP scope and acceptance boundaries

### Must-have for a usable first release

- One clinic configuration for SmileCare; public caller access without account signup.
- Owner invitation/account creation, secure staff sign-in, password recovery, sign-out, owner/staff role enforcement, and backend authorization.
- Clinic onboarding checklist and explicit activation/deactivation of the public experience.
- Public voice experience with consent, supported-language clarity, start/stop, transcript/state, microphone and network error recovery, and human contact fallback.
- English end-to-end at launch unless another language passes speech recognition, AI response, speech output, and clinic-content acceptance tests.
- Secure integration of speech recognition, AI response/tool action, and speech output, with configuration/health status and safe provider error handling.
- Staff-managed, validated dentist/service/FAQ content and clinic hours/contact/settings; only approved/published content supplied to the assistant.
- Truthful appointment flow with validated name/phone/date/time, configured time-zone rules, conflict-safe save, explicit confirmed vs pending status, and staff follow-up list. Use pending confirmation whenever availability is not authoritative.
- Authenticated appointment list/detail and basic status update/cancel/reschedule with audit trail.
- Voice library controls behind authorization with sample permission checks, preview, activation, error handling, and safe delete behavior.
- Staff call-log/transcript list/detail with appropriate access, bounded search/filter, retention/deletion policy, and minimal audit trail.
- No outbound messages by default; no UI claim that mock reminders or mock WhatsApp are delivered.
- Consent notice, transcript/data handling, retention defaults approved by clinic, and operational support/failure paths.
- Basic operational health visibility for the database and speech/AI/TTS dependencies; staff can distinguish degraded service from empty data.

### Deferred until after MVP

- Patient accounts, patient dashboards, appointment history self-service, and online self-cancellation.
- Multi-tenant clinic onboarding, multiple locations, complex staff role matrices, SSO, and enterprise provisioning.
- Additional languages until individually tested and fully supported; automatic language switching.
- External practice-management/EHR synchronization, live room/provider capacity, complex duration/resource scheduling, waitlists, and insurance eligibility.
- Automated SMS, WhatsApp, email, outbound reminder calls, live call transfer, and delivery retries until provider, consent, templates, callbacks, and compliance are implemented.
- Advanced reports, custom analytics, data warehouse, configurable exports, and automated quality scoring.
- Clinical triage, diagnosis, treatment recommendations, prescription handling, or emergency-service integration.
- Raw call recording/storage, voice biometrics, advanced voice cloning consent management, and custom audio retention.
- Complex support ticketing and CRM integrations.

### MVP release checks

The release is not ready until: (1) no protected staff data can be accessed without authentication and role checks; (2) the owner has reviewed all live clinic content and contact details; (3) the language selector matches actual recognition/output support; (4) appointment status is backed by verified rules and a successful save, or clearly remains pending; (5) consent/privacy and retention wording are approved; (6) mic, provider, database, and save failures have tested recovery; (7) no mock notification is presented as a real delivery; and (8) the clinic has completed a test call and staff follow-up rehearsal.

## 11. Product decisions requiring clinic sign-off

Before implementation is treated as production scope, confirm: clinic hours and holidays; address/contact/escalation copy; time zone; exact language at launch; appointment length/capacity, booking horizon and staff-confirmation mode; whether seeded dentists/services/FAQs are accurate; transcript access and retention; consent/privacy wording; permitted voice-clone samples; staff owner and invite list; and whether any notification provider/channel is in scope. Until answered, the proposed defaults in Section 4 are planning assumptions only.

## 12. Coverage review and limitations

This brief separates existing prototype observations from recommendations; covers public and staff dashboards with actor, interaction, validation, error, and success behavior; defines onboarding, voice, appointment, notification, support, and account workflows; explains components and data actions; and specifies assumptions, access, privacy, failure handling, and MVP/deferred scope.

The source review was limited to the visible React user/admin pages, voice hook, backend voice/WebSocket routes, database models, seed data, and application entry point. It verifies the capabilities and gaps summarized above, but does not establish production deployment security, third-party contract/compliance posture, real-world appointment capacity, clinic-approved content, runtime reliability, or whether any external provider configuration is currently valid. These require clinic decisions and implementation/runtime validation; no unstated integration or policy is claimed as existing.
