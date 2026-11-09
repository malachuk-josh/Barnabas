# Barnabas

A voice-first AI companion for church ministry leaders. Barnabas remembers each leader's people and plans across conversations, watches for volunteer burnout, drafts messages in each member's language, and never sends anything without the leader's yes.

Built with Next.js on Vercel, Claude (Anthropic API) and Redis.

## What's in this build

| Area | What works | Notes |
|---|---|---|
| Talk | Push-to-talk voice and text chat with streamed replies, spoken sentence by sentence; tap to interrupt | Voice uses the browser's built-in speech recognition and voices (Chrome, Edge, Safari). Firefox falls back to typing |
| Memory | Per-leader markdown files in Redis; notes saved during a call; organized by Claude's memory tool after each call; "What Barnabas remembers" screen with edit and delete | Deleting a conversation asks Barnabas to remove what it learned from it |
| Privacy | Off-the-record mode, code-enforced memory policy (no secrets; no health, counseling or family details unless the church opts in), crisis protocol with 988 | Rules are keyword-based in v1; see `src/lib/policy` |
| Volunteer care | Burnout radar combining load across teams, consecutive weeks, declines, the volunteer's own worship and small-group attendance, and thank-you recency | Every flag shows its reasons and a suggested next step. The church's own leaders are never flagged as burning out: a long run reads as "watch", with a thank-you and a Sunday off |
| Messages | Drafts with per-recipient translation (English, Spanish, Korean) and a review screen; a leader taps **Send** on a draft to deliver it by text (Twilio) or email (Resend), with delivery status, opt-outs and a send log | Barnabas drafts; only a person sends. See [Text and email delivery](#text-and-email-delivery) |
| People | The church's own database: people, households, contact details, member status, birthdays and anniversaries, groups, attendance, notes and custom fields, with duplicate merging and archive; a guided migration from ChurchTrac or Planning Center (.csv or .xlsx) with preview, dry run, import log and undo | See [People](#people-the-churchs-own-database) and [Move your church to Barnabas](#move-your-church-to-barnabas). Before anyone is added, the demo church's real leaders, teams, schedule and events, with no made-up congregation |
| Reports | Attendance, giving vs budget, volunteer health, care pipeline, guest follow-up, events and kids check-in, each with a chart, a text summary, a table and a CSV; a monthly ministry report drafted into Drafts | See [Reports](#reports) |
| Mesa | A consent-based network of churches sharing sermon series, service templates, training, event ideas and needs, never people | See [Mesa](#mesa-the-church-to-church-network) |
| Calendar | Month and agenda views, create, edit and delete; Barnabas adds and changes events when asked and must ask before deleting; Google and Outlook events and church events shown alongside | Google and Outlook two-way sync need a one-time app registration (below); Apple Calendar and any other app can subscribe to a private link |
| Finance | Overview, budget and plans, fund accounting (chart of accounts, funds, split transactions, bank reconciliation, CSV import), giving (batches, recurring givers, donor history, year-end statements), missions (partners, pledges, faith-promise campaigns) and printable reports; Barnabas answers budget, giving and missions questions and records gifts and expenses after a yes | See [Finance](#finance) below. The demo church starts with labeled demo books |
| Care | Pastoral care cases with a contact timeline, prayer requests, guest follow-up with a public guest card, the discipleship pathway and classes, and a private care-load tracker; Barnabas opens cases, logs contacts and records guests when asked, and asks before reassigning or closing | See [Care](#care) below. The demo church starts with example classes only; no one's care records are made up |
| Serve | Rosters per team per gathering (Sunday 8:30 and 10:45, 9:45 Growth Groups, Wednesday 6:00), sign-ups, swap requests, away dates, monthly limits, auto-fill and reminder drafts; the burnout radar reads real rosters | See [Operations](#operations-serve-services-events-and-kids). Reminders are drafts only |
| Services | Sermon series, the preaching rotation and orders of service with scripture linked into The Word | |
| Events | Registration forms, capacity and waitlist, a public sign-up link, attendee lists with CSV export, event-day check-in, and registration status on the Calendar | Online payment (Stripe) isn't built: paid events are settled at the door |
| Kids | Check-in station, 4" × 2" child labels with matching parent pickup tags, checkout by pickup code, room counts and ratio warnings, families with allergies and authorized pickups | Restricted to `kids.checkin` and `kids.admin`; Barnabas sees counts only |
| Roles | Pastor, treasurer, deacon, staff, leader and kids check-in, set by an admin in **Settings → Team**; checked in code on every finance request and tool call | Admins are bootstrapped with `BARNABAS_ADMIN_EMAILS` |
| Settings | Profile (name, what Barnabas calls you, role, ministries, about you), time zone, reply language, voice language and speed, calendar connections, team roles (admins), delete all data | Barnabas reads the profile at the start of each conversation |

Design and research: [`docs/barnabas-voice-harness.md`](docs/barnabas-voice-harness.md), [`reports/`](reports/).

## How a voice turn works

1. The leader taps the mic. The app starts a conversation, which freezes the leader's memory and today's briefing into Barnabas's instructions and warms Claude's prompt cache in the background.
2. The browser transcribes speech. When the leader stops, the transcript goes to `POST /api/chat`.
3. The server appends the turn (history is append-only), streams Claude, and runs tools. Text streams back as newline-delimited JSON.
4. The browser speaks each finished sentence. When a lookup starts, it plays a short holding phrase ("Let me check the schedule").
5. If the leader interrupts, playback stops. The server still finishes and saves the full reply, and the next turn tells Claude what the leader actually heard.
6. When the conversation ends, a background job runs Claude with the memory tool to fold what it learned into the leader's memory files.

Key code: `src/lib/calendar/` (calendar, sync providers, subscription feed), `src/lib/profile/` (leader profile), `src/lib/engine/turn.ts` (turn loop), `src/lib/engine/claude.ts` (request shape and caching), `src/lib/engine/tools.ts` (tools and confirmation gates), `src/lib/engine/memory-jobs.ts` (memory consolidation and forgetting), `src/lib/memory/fs.ts` (memory files in Redis), `src/components/Talk.tsx` (browser voice).

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY at least
npm run dev                  # http://localhost:3000, access code "grace" when BARNABAS_ACCESS_CODE is unset
```

Without Redis settings, local development uses in-memory storage (lost on restart). To use a local Redis: `REDIS_URL=redis://localhost:6379`.

```bash
npm test          # unit tests (no API key needed; Claude is scripted)
npm run typecheck
npm run build
```

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import this GitHub repository. The framework is detected as Next.js; no build settings need changing.
2. In the project, open **Storage** (or the Marketplace) and add **Upstash for Redis**. Connecting it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. In **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: your Anthropic API key
   - `SESSION_SECRET`: a random string of at least 32 characters (for example from `openssl rand -base64 48`)
   - `BARNABAS_ACCESS_CODE`: the code your leaders will enter to sign in
   - `BARNABAS_ADMIN_EMAILS`: comma-separated emails of the people who manage roles (for example the senior pastor). They start as pastor
   - Optional: `BARNABAS_CHURCH_NAME`, `BARNABAS_MODEL`, `BARNABAS_EFFORT`, `BARNABAS_VOICE_MODEL` (spoken turns; default `claude-sonnet-5-5`), `BARNABAS_ALLOW_SENSITIVE_MEMORY` (see `.env.example`)
4. Redeploy. The app refuses to start sign-in without `SESSION_SECRET` and `BARNABAS_ACCESS_CODE`, and refuses to run without Redis in production, so a missing setting fails closed instead of exposing data.

The streaming chat route runs up to 60 seconds per turn and memory consolidation up to 120 seconds (`maxDuration` in each route). Leave Fluid compute on (the Vercel default).

## Barnabas's voice setup

Without these keys, Barnabas uses the device's built-in voice and the browser's speech recognition (push-to-talk only).

1. **ElevenLabs** (natural voice): create an account at https://elevenlabs.io/pricing. The free plan is fine for testing; use Starter or higher for commercial use and cloning. To use your own voice, go to Voices → Add voice → Instant Voice Clone (1–2 minutes of clean audio), or Professional Voice Clone on Creator and up (30+ minutes). Copy the voice ID.
2. **Deepgram** (listening and hands-free): create an account at https://console.deepgram.com/signup ($200 free credit) and create an API key with Member access.
3. In Vercel, set `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `DEEPGRAM_API_KEY` (optional `ELEVENLABS_MODEL`, default `eleven_v4_turbo`), then redeploy.

Leaders can pick or preview a voice, turn on hands-free mode, and teach Barnabas pronunciations in **Settings → Barnabas and voice**. The API keys stay on the server: speech is proxied through `/api/voice/tts`, and the browser listens with a 60-second Deepgram token from `/api/voice/stt-token`.

**Voice test (admins only, hidden).** `/voice-test` plays the same words three ways so you can compare by ear on a phone: A is today's sentence-by-sentence path; B and C use one ElevenLabs Text to Dialogue WebSocket connection (`eleven_v4_turbo`, the only live connection that accepts v4 Turbo), sent all at once or fed a few words at a time like Claude's stream. Each shows time to first audio and total time. That connection accepts only `stability` from the voice settings, so B and C don't carry today's style, similarity and speaker boost. Anyone not in `BARNABAS_ADMIN_EMAILS` gets a 404. To try it locally without ElevenLabs, run `node scripts/fake-elevenlabs-ws.mjs 8765` and set `ELEVENLABS_WS_URL=ws://127.0.0.1:8765`.

## Calendar sync setup

Leaders connect calendars in **Settings → Calendars**. Three options:

**Apple Calendar (and any calendar app): works with no setup.** Each leader creates a private subscription link. On iPhone or Mac, "Add to Apple Calendar" opens the subscribe dialog. The same link works in Google Calendar (Other calendars → From URL) and Outlook (Add calendar → Subscribe from web). It's one-way (Barnabas → calendar app), refreshes about hourly (Google refreshes on its own schedule, sometimes several hours), and carries titles, times and places only.

**Google Calendar two-way:** one-time setup by an administrator.
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Configure the **OAuth consent screen** (External; while in testing, add each leader's Google address as a test user).
3. Create an **OAuth client ID** of type *Web application* with the authorized redirect URI `https://barnabas-three.vercel.app/api/calendar/callback/google`.
4. In Vercel, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL=https://barnabas-three.vercel.app`, then redeploy.

**Outlook two-way:** one-time setup by an administrator.
1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), register an application for *accounts in any organizational directory and personal Microsoft accounts*.
2. Add a **Web** redirect URI: `https://barnabas-three.vercel.app/api/calendar/callback/microsoft`.
3. Under API permissions add Microsoft Graph delegated permissions `Calendars.ReadWrite`, `User.Read` and `offline_access`; create a client secret.
4. In Vercel, set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `APP_URL`, then redeploy.

With two-way sync, the leader's Google or Outlook events appear (read-only) on the Barnabas calendar and in Barnabas's planning, and Barnabas's events are copied into Google or Outlook. Sign-in tokens are encrypted at rest with a key derived from `SESSION_SECRET`. Private notes never leave Barnabas.

## Roles and permissions

Every leader has a role, kept on their leader record (`leader:{church}:{leaderId}`) and read fresh on every request, so a change applies right away. New sign-ins start as **leader**. People listed in `BARNABAS_ADMIN_EMAILS` are admins: they start as **pastor** and can set anyone's role in **Settings → Team**, which lists everyone who has signed in.

| Permission | Pastor | Treasurer | Deacon | Staff | Leader | Kids check-in |
|---|---|---|---|---|---|---|
| See finance summaries, budgets, funds, missions and reports (`finance.view`) | Yes | Yes | Yes | No | No | No |
| Change budgets, transactions, gifts and missions records; import and reconcile (`finance.edit`) | Yes | Yes | No | No | No | No |
| See individual giving: donor names, gifts, pledges, statements (`giving.donors`) | Yes | Yes | No | No | No | No |
| See every care case, including confidential ones (`care.view_all`) | Yes | No | No | No | No | No |
| Assign care cases to someone else; keep the pathway and classes; make guest-card links (`care.assign`) | Yes | No | Yes | Yes | No | No |
| Schedule any team's roster, positions and volunteers (`ops.schedule`); a team's lead can always schedule their own team | Yes | No | No | Yes | No | No |
| Plan series, the preaching rotation and orders of service (`services.plan`) | Yes | No | No | Yes | No | No |
| Create events, see registrants, export and check people in (`events.manage`) | Yes | No | Yes | Yes | No | No |
| Run kids check-in: find families, check in and out, labels, room counts (`kids.checkin`) | Yes | No | No | Yes | No | Yes |
| Add and edit families and children, medical notes and pickups (`kids.admin`) | Yes | No | No | Yes | No | No |
| Send approved drafts by text or email (`messages.send`); deacons may send care follow-ups (guest thank-yous and care drafts) | Yes | No | Care only | Yes | No | No |
| Add, edit, merge and archive people, households, groups and custom fields; run the migration tool (`people.edit`) | Yes | No | No | Yes | No | No |
| Download the church directory as CSV (`people.export`) | Yes | No | No | Yes | No | No |
| Share resources with connected churches on Mesa (`network.share`) | Yes | No | No | Yes | No | No |
| Set roles (`team.manage`); connect churches on Mesa | Admins only (`BARNABAS_ADMIN_EMAILS`), whatever their role |

The check is `can(access, permission)` in `src/lib/auth/roles.ts`. API routes use `requirePermission()`; Barnabas's tools call the same check. The Finance navigation entry is hidden from roles without `finance.view`, and Kids from roles without `kids.checkin`. Everyone signed in can read rosters, the preaching rotation, orders of service and event counts, and sign up to serve. A kids check-in volunteer gets the **Kids check-in** role: the check-in station, room counts and labels, and their own profile, and nothing else (no Talk, The Word, Calendar, Care, Finance or family records). Other pages send them to the station and other APIs return 403; the limit is checked on the server (`isCheckinOnly` / `checkinMayUse` in `src/lib/auth/roles.ts`, applied in `AppShell` and `requireLeader`). An administrator is never limited this way.

Care cases follow their own visibility rules (`src/lib/care/visibility.ts`), checked on every page, API call and Barnabas tool:

| Who | Sees |
|---|---|
| Pastor | Every case, including confidential ones |
| Deacon | Cases assigned to them, and every case that isn't confidential |
| Staff, treasurer, leader | Only cases assigned to them |
| Confidential cases | Pastors only, whoever they're assigned to; only a pastor can hold one |

Prayer requests marked shareable are visible to the whole team; private ones to the pastors and whoever added them. A case someone can't see reads as "not found".

## Finance

**Finance** (after Calendar) has six views:

- **Overview**: year-to-date income vs expenses, the General fund balance and each restricted fund, giving this month vs the same days last year, budget health by ministry (on track, watch, over), and missions giving vs pledged. Each number says where it comes from.
- **Budget**: an annual budget per fiscal year (the calendar year) by account, entered monthly or annually, with actual, budget to date, variance, percent spent and health. Lines marked seasonal (insurance, a summer trip) are judged against the whole year. Plan notes, and copy last year's budget into a new year.
- **Funds and ledger**: the chart of accounts (assets, liabilities, income, expenses), funds (General unrestricted; Missions, Building and Benevolence restricted), transactions split into lines (account, fund, amount, memo), bank reconciliation against a statement balance, and CSV import from the bank with suggested accounts and duplicate checks. Payroll appears as expense accounts only: paychecks run through a payroll provider such as Gusto, and Barnabas doesn't calculate pay.
- **Giving**: gift records (a directory person or a new name; cash, check, online or ACH), Sunday batch entry posted as one deposit with a line per fund, recurring givers, donor history, printable year-end contribution statements, and a monthly trend chart. Online giving through Stripe is a later step (shown as "coming soon").
- **Missions**: partners (missionaries and organizations, field, type, support level, monthly commitment, pledge dates, prayer updates), pledges toward a faith-promise campaign, and given vs pledged. It ties to the restricted Missions fund.
- **Reports**: a printable monthly finance report for the deacons or board (income and expense by category vs budget, fund balances, missions) and a giving report.

**Confidentiality.** Individual giving is visible to the pastor and treasurer only. Deacons see totals and trends, never names, in the app, the API and Barnabas. Barnabas shares one donor's totals only when the pastor or treasurer asks, and never their full ledger. Every finance write is in the audit log. Barnabas doesn't give tax or legal advice; it points to the church's accountant.

**Barnabas tools**: `finance_overview`, `budget_status`, `missions_status`, `giving_summary` (read-only), and `record_gift` and `record_expense`, which propose first and run only after the leader says yes on a later turn.

**Demo data.** The demo church gets a labeled demo dataset the first time Finance is opened, only while it has no finance data: a budget for a church of about 175, twelve months of transactions, giving recorded as anonymous offering lines (the Sunday plate, the online payout, missions, building and benevolence offerings) with no donor attached, and fictional missions partners. No donor, recurring gift or pledge is made up, so the donor list, statements and pledges start empty. A pastor or treasurer can clear it from the banner and start with empty books.

**Storage**: `fin:{church}:*` keys in Redis (chart, transactions and gifts by year, budgets by year, reconciliations, recurring givers, missions). Amounts are whole cents. Code: `src/lib/finance/`.

## Care

**Care** (after Finance, a heart icon; under More on phones) has five views:

- **Cases**: pastoral care for a person or household. Types: hospital, grief, illness, crisis, new baby, homebound, prayer, counseling referral, other. Status moves new → assigned → active → follow-up → closed. Each case has who holds it (a pastor, deacon or other team member), a next step with a due date, a one-line summary, and a timeline of contacts (visit, call, text, card, meal) with a minimal note. A board by status or a list, filtered by mine or all, type and overdue.
- **Prayer**: who, the request, private or shareable, how many times the team has prayed, and answered.
- **Guests**: guest cards (name, contact, how they heard, kids' ages, prayer request, interests). Each new card makes a thank-you text or email, drafted into the Drafts review queue within 24 hours (a pastor, deacon or staff member sends it from there), a welcome call within 48 hours, and after a second visit an invitation to Discover Faith. Cards are assigned in rotation among the deacons and connections staff; anyone in a busy season (from the church's leadership notes) takes about half as many. Pastors, deacons and staff can make a **public guest-card link** (`/welcome/{token}`) that guests fill in on their own phone: the token is 32 random bytes looked up by its hash, links can be turned off, and submissions are rate-limited (5 per address per 10 minutes, 60 per link per hour) with a honeypot.
- **Next steps**: the discipleship pathway (first visit, Discover Faith class, salvation decision, baptism, membership class, membership, a Growth Group or Life Group, serving, giving), each step with a date, and who's ready for their next one with the reason (for example baptized but not a member, or attending 3+ months but not in a group). Discover Faith and membership classes with sessions, a teacher, enrollees, attendance, and completion, which records the pathway step.
- **My care load**: private to each person. Open cases by type and weight (crisis 3; grief, hospital and counseling referral 2; illness 1.5; others 1; prayer 0.5), contacts in the last 7 days, days without a day off (from "Rest / sabbath" calendar events and an "I took a day off" log), and a gentle signal: **steady**, **full** (one thing is full) or **stretched** (one thing is heavy, or two are full), always with its reasons and thresholds. Others see only the team view: total open cases and how evenly they're spread, as anonymous shares.

**Privacy.** Every note, next step, summary and prayer request goes through the same memory policy as Barnabas's memory (`checkMemoryText`): the case type can say "illness", but notes can't hold diagnoses or other health, counseling, family, addiction, legal or money details unless the church sets `BARNABAS_ALLOW_SENSITIVE_MEMORY=true`. Secrets are never stored. Every care write is in the audit log.

**Reminders.** Next steps and guest tasks appear in the Talk briefing under Follow-ups (overdue ones marked) and as suggestions on the Calendar, along with a day off when your load is full or stretched. Nothing is added to the calendar unless you add it.

**Barnabas tools**: `list_care_cases`, `care_case_detail`, `my_care_load`, `discipleship_next_steps` ("Who's ready for the membership class?") and `recent_guests` (read-only); `open_care_case`, `log_care_contact`, `add_prayer_request` and `record_guest`, which Barnabas does when asked and then says what it did; and `assign_care_case` (to someone else) and `close_care_case`, which propose first and run only after a yes on a later turn. Each conversation starts with the leader's own open cases, overdue next steps and care load. The older `log_care_event` tool still works and lands on the person's open case; earlier records from it are folded into cases once.

**Demo data.** The first time Care is opened, the demo church gets only two labeled demo classes: Discover Faith taught by Eric Malachuk and the membership class taught by Ethan Malachuk, with no one enrolled. No one receiving care is made up: cases, prayer requests, pathways and guests start empty, each with a warm empty state and a first step. Nothing is made up about the real leadership, and no rest data is seeded for them. A pastor can clear the demo data from the banner. The leadership bios in Barnabas's context are our own summaries of the church's website plus details the church supplied.

**Storage**: `pcare:{church}:*` keys in Redis (cases, prayers, pathways, classes, guests, links, rotation), each leader's private day-off log at `pcare:{church}:rest:{leaderId}`, and public link lookups at `welcome:{sha256(token)}`. Code: `src/lib/care/`.

## Operations: Serve, Services, Events and Kids

Four areas after Care in the navigation (under More on phones). The weekly gatherings they share are Sunday 8:30 and 10:45 worship, Sunday 9:45 Growth Groups, and Wednesday 6:00 Kids Club and Teen Group (`src/lib/ops/gatherings.ts`).

### Serve (volunteer scheduling)

- **Rosters** (`/serve`): pick a Sunday or Wednesday; each gathering shows every team that serves at it, each position and its slots, filled or open. Anyone signed in can **sign up** for an open slot (they join the team), say they **can't make it**, or **ask a teammate to cover**; the teammate accepts or declines, and on accept the roster updates. Schedulers and team leads **assign** from a list of who's free (best first: fewest Sundays in the last eight weeks), **fill open slots** automatically, and **remove** people.
- **Rules, enforced on every change**: no one serves two places at the same gathering; no one is scheduled on their **away dates** (blackouts); a volunteer with a **monthly limit** is never scheduled on more distinct dates in a month than that, by hand, by auto-fill or by a swap. Availability is checked again when a swap is accepted.
- **Reminders**: "Draft reminders" writes one draft per date with a personal line for each volunteer (their positions and times) into the **Drafts** review queue. Nothing is sent until a scheduler taps Send there (see [Text and email delivery](#text-and-email-delivery)).
- **My serving** (`/serve/mine`): your upcoming slots, swap requests waiting on you, and your away dates. **Teams and availability** (`/serve/teams`): positions (team leads edit their own team), volunteers with their limits and away dates, and new teams (schedulers).
- **Burnout radar**: the radar on Talk now reads these rosters. Teams with roster data in the last eleven weeks use it; teams without any fall back to the church database's serving history. The church's own leaders are never flagged as burning out: a long run reads as "watch", with a thank-you and a Sunday off.
- **Who edits**: `ops.schedule` (pastors, staff) edits every team; a team's lead (by the name the church published, for example Travis Willette for Greeters) edits that team.

### Services (sermon and service planning)

- **Rotation and series** (`/services`): the next twelve Sundays with who preaches, the series, passage and sermon title, and whether each service has an order yet. Sermon series have a title, a passage range and dates; Sundays in a series pick it up.
- **Order of service** (`/services/plan`): for each worship service, items (welcome, songs, scripture reading, prayer, sermon, communion, offering, announcements, baptism, benediction, other) with minutes, who leads and scripture, reordered with up and down buttons, and the running total. "Start from the usual order" fills in the preacher and passage from the rotation and the worship leader from the roster, with communion on first Sundays; one service can be copied to the other.
- **The Word**: every scripture reference is parsed (`src/lib/services/scripture.ts`, using The Word's book list read-only) and links to `/word?b={book}&c={chapter}&v={verse}`, the same deep link The Word's share button makes. Nothing in The Word changed.
- **Who edits**: `services.plan` (pastors, staff). Everyone can read.

### Events and registrations

- **Events** (`/events`): each event with registration shows how it's filling. Create one from scratch or from the church calendar, with capacity (counting party size), a waitlist, up to how many people per registration, a cost (display only) and a form of your own questions: short answer, choice, number, yes/no, each optional or required.
- **Public registration page** (`/register/{token}`): no sign-in. Like the guest card, the token is 32 random bytes looked up by its hash, a new link turns the old one off, and submissions are rate-limited (5 per address per 10 minutes, 200 per link per hour) with a honeypot. It never shows who else registered. When an event is full, new registrations join the waitlist (if it has one) and move up, in order, when someone cancels.
- **Attendees** (`/events/{id}`): registered, waitlist and cancelled lists, event-day **check-in**, cancel, move up from the waitlist, add someone by hand, and **CSV export** (cells starting with `=`, `+`, `-` or `@` are escaped so a spreadsheet won't run them; every export is audited).
- **Payments: Stripe plugs in here.** Online payment isn't built. A paid event marks each registration's `payment` as `due` with the amount, and a leader marks it paid at the door. A Stripe Checkout session and webhook would set `payment.status` and `payment.providerRef` (`src/lib/events/types.ts`); nothing else needs to change.
- **Calendar**: events with registration appear on the Calendar with their status ("Registration open · 12 of 40 registered") and a link to their registrations.
- **Who manages**: `events.manage` (pastors, deacons, staff). Everyone signed in sees events and counts.

### Kids check-in

- **Check-in station** (`/kids`): pick the gathering, search a family by last name or the last four digits of a parent's phone, tick the children, pick each room, and check in. Children checked in together share one random **pickup code**. **Labels** (`/kids/labels`) print at 4" × 2" (`@page { size: 4in 2in }`): a label per child (name, room, allergy, code) and a matching **parent pickup tag**. **Checkout** needs the code from the parent's tag; a wrong code, or a person who isn't a guardian or authorized pickup, is refused and logged. Dragging down on the station doesn't reload the page.
- **Rooms** (`/kids/rooms`): live counts per room (refreshing every 15 seconds), adults per room, and **ratio warnings** (fewer than two adults, or more children than the room's ratio allows). **Families** (`/kids/families`): guardians, children (grade, usual room, allergies, medical notes) and authorized pickups.
- **Children's data is protected in code**: the station and room views need `kids.checkin`; adding and editing families, and seeing medical notes or full phone numbers, need `kids.admin`. Medical notes are never on labels or the station. Every check-in, check-out and refused checkout is in the church's kids log and the leader's audit log. Barnabas gets only counts and ratio warnings, and first names only when asked (`kids_checkin_counts`); the memory policy always rejects children's pickup codes, allergies, medical, custody and check-in details, even when a church allows sensitive memory.

### Barnabas tools

`whos_serving`, `find_coverage`, `preaching_rotation`, `plan_service`, `event_registrations` and `kids_checkin_counts` look things up. `draft_serving_reminders` drafts reminders into the review queue and `outline_service` starts an order of service. `schedule_volunteer` (putting someone in a slot) and `set_preacher` (when it replaces someone) propose first and run only after a yes on a later turn. Barnabas never suggests a volunteer the tools didn't list.

### Demo data

The demo church has no made-up congregation. Rosters hold only Mount Greylock's real leaders in their real roles: Aaron Malachuk leads worship at both services every week, and Travis Willette (Greeters) and Micah Hayre (Parking) serve about twice a month, capped at two. The preaching rotation has Ethan Malachuk most Sundays and Eric Malachuk sometimes; no series, passages or orders of service are made up. Three real MGBC events take registration (Reverb All-Nighter, $67; the Thanksgiving Communion Service; the Teens Christmas Party) with no one registered. Kids check-in has its rooms and no families. Every list starts with a warm empty state and a first step, and each area's banner lets a scheduler, planner or manager clear the demo data.

### Storage

`ops:{church}:*` (teams, volunteers, assignments, swaps), `svc:{church}:*` (series, rotation, plans), `evt:{church}:*` (events, registrations) with public link lookups at `evtlink:{sha256(token)}`, and `kids:{church}:*` (rooms, households, check-ins, staffing, log). Code: `src/lib/serve/`, `src/lib/services/`, `src/lib/events/`, `src/lib/kids/`, `src/lib/ops/`, with a shared per-church store in `src/lib/store/book.ts`.

## Communication and growth (Phase 4)

### Text and email delivery

Every message starts as a draft in **Drafts**: Barnabas's drafts, serving reminders from Serve, guest thank-yous from Shepherding, and the monthly report. A leader reviews a draft and taps **Send**, then confirms ("Send to 3 people by text now?"). That request, from that leader, for that draft, is the only way anything leaves Barnabas: `POST /api/drafts/{id}` with `{ action: "send", confirm: true }` calls `sendApprovedDraft` in `src/lib/messages/service.ts`. Barnabas has no tool that reaches it (a test checks that no engine module imports it); when the leader tells Barnabas to send, its `send_draft` tool only says the draft is waiting in Drafts.

- **Who sends** (`messages.send`): pastors and staff send any draft. Deacons carry the guest follow-up rotation and care visits, so they may send `care` drafts (guest thank-yous and care follow-ups) and nothing else. Treasurers and leaders can draft with Barnabas; someone with `messages.send` sends. (`canSendDraft` in `src/lib/messages/permissions.ts`.)
- **Text** goes through Twilio's Messages API, **email** through Resend's Emails API, both with `fetch` (no SDKs). Contacts come from the draft, the guest card, the volunteer record or the church directory, in that order; someone with no number or address on file is recorded as "no contact".
- **Exactly once per person**: each recipient gets an idempotency key (draft, person, channel, address), claimed in Redis before the provider call and sent to Twilio (`I-Twilio-Idempotency-Token`) and Resend (`Idempotency-Key`). Sending again, or a double tap, never sends twice; a retry after a failure sends only to the people who didn't get it.
- **Rate limits**: 60 messages a minute and 1,000 a day per church, and 20 drafts per leader per ten minutes. Over the limit, nothing is sent and the draft stays in review.
- **Opt-outs**: each church keeps a do-not-text list (STOP and its synonyms on the inbound webhook, and Twilio error 21610 on a send or a status callback) and a do-not-email list (the unsubscribe link, hard bounces and spam complaints). Every email ends with an unsubscribe link and carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. The link opens a page with one button, so link scanners don't unsubscribe anyone; one-click POSTs from mail apps work directly. Tokens are HMAC-signed with a key derived from `SESSION_SECRET`.
- **Delivery status**: Twilio posts status callbacks to `/api/messages/twilio/status`, verified with `X-Twilio-Signature` (HMAC-SHA1 with the auth token over the URL and sorted parameters). Resend posts webhooks to `/api/messages/resend`, verified with svix signatures (`svix-id`, `svix-timestamp` within five minutes, `svix-signature`) against `RESEND_WEBHOOK_SECRET`. Statuses never move backwards (a late "sent" doesn't undo "delivered"). These routes and `/api/messages/unsubscribe` are public in `src/middleware.ts` because they check their own signatures.
- **Send log** (`/drafts/log`): every recipient of every send, who approved it, and what the carrier or mail server reported, with numbers and addresses masked. Pastors and staff see the church's log; deacons see their own sends.
- **Not set up yet**: until the keys are set, Send shows the setup steps below in the app, naming exactly which variables are missing (never their values). Drafts wait.

**Storage**: `msg:{church}:*` (deliveries, the send log, do-not-text and do-not-email sets, idempotency claims, rate counters) and `msgref:{twilio|resend}:{id}` to match webhooks to deliveries. Code: `src/lib/messages/`.

#### Setting up texting (Twilio)

1. Create an account at [twilio.com/try-twilio](https://www.twilio.com/try-twilio), upgrade it from trial (trial accounts only text verified numbers), and buy a local number with SMS (**Phone Numbers → Manage → Buy a number**).
2. **A2P 10DLC registration (required for US texting from a local number).** In **Messaging → Regulatory compliance → A2P 10DLC**, register the church as a brand (legal name, EIN, address; nonprofits can use the 501(c)(3) path) and then a campaign: use case "Charity / Non-profit" or "Mixed", a description ("Serving reminders and follow-ups for members and guests of our church"), two or three sample messages, and how people opt in (for example the connection card and the sign-up form). Approval usually takes a few days to a few weeks; until then carriers block or filter texts. See [Twilio's A2P 10DLC guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc). A toll-free number with [toll-free verification](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding) is the alternative.
3. Create a **Messaging Service** (**Messaging → Services**), add the number to its sender pool, and link it to the campaign. Copy its SID (`MG…`).
4. In Vercel, set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (Console home page), `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER=+1…` to send from the number directly), and `APP_URL=https://barnabas-three.vercel.app`. Redeploy.
5. On the Messaging Service (**Integration → Incoming messages → Send a webhook**) or the number (**Messaging configuration → A message comes in**), set `https://barnabas-three.vercel.app/api/messages/twilio/inbound` (HTTP POST), so STOP and START replies update the do-not-text list. Leave Twilio's Advanced Opt-Out on (the default): Twilio answers STOP itself.
6. Status callbacks need no setup: each send asks Twilio to report to `https://barnabas-three.vercel.app/api/messages/twilio/status?c={church}`.

#### Setting up email (Resend)

1. Create an account at [resend.com/signup](https://resend.com/signup). Under **Domains → Add domain**, add the church's domain (a subdomain such as `mail.yourchurch.org` keeps it separate from your everyday mail), add the SPF and DKIM records it shows at your DNS host, and wait for **Verified**. See [Resend's domain guide](https://resend.com/docs/dashboard/domains/introduction). Adding a DMARC record (`v=DMARC1; p=none;`) helps delivery.
2. **API Keys → Create API key** with "Sending access", limited to that domain.
3. **Webhooks → Add endpoint**: `https://barnabas-three.vercel.app/api/messages/resend`, with the `email.sent`, `email.delivered`, `email.bounced`, `email.complained` and `email.failed` events. Copy its signing secret (`whsec_…`). See [Resend webhooks](https://resend.com/docs/dashboard/webhooks/introduction).
4. In Vercel, set `RESEND_API_KEY`, `RESEND_FROM` (for example `Mount Greylock Baptist Church <office@mail.yourchurch.org>`), `RESEND_WEBHOOK_SECRET` and `APP_URL`. Redeploy.

### People: the church's own database

Barnabas is the church's system of record. A church moves its records in once from ChurchTrac or Planning Center, and from then on its people live here; there is no ongoing sync with either. (Planning Center comes in through its own CSV exports rather than an API token: the same data for less code, and no long-lived credential to keep.)

**People** (`/people`, after Calendar in the navigation) holds:

- **People**: first and last name, the name they go by, email, mobile and home phone, address, birthdate, anniversary, member status (member, regular attender, visitor, child, inactive, deceased), membership date, the language they read messages in, and the church's **custom fields**.
- **Households**: who lives together and each person's place in the household (head, spouse, child, other), edited on any member's page.
- **Groups**: Growth Groups, Life Groups, classes, ministries and teams, with members and leaders (`/people/groups`).
- **Attendance**: who was at each gathering (Sunday 8:30, 9:45, 10:45, Wednesday 6:00) and each group, by date (`/people/attendance`). It feeds Reports and the weariness radar.
- **Notes**: minimal notes on a person, held to the same memory policy as Barnabas's memory and Shepherding notes; a pastor can mark one pastors-only.
- **Duplicates** (`/people/duplicates`): people with the same email, mobile number or name. Merging keeps one record, fills its blanks from the other, moves groups, attendance and notes, and points Shepherding cases, serving and giving at the kept record. Links to the merged record keep working.
- **Archive**: someone who has moved away leaves the directory and lists; their history stays, and they can be restored.

**One set of people for everything.** The People database is the `ChurchData` source (the native adapter, `src/lib/people/native.ts`): Shepherding, Serve, the weariness radar, Finance donors, Reports, Mesa's scrubber and every Barnabas tool read the same people. Until the first person is added, Barnabas uses the demo church: Mount Greylock's published leaders and schedule, with no made-up congregation. Once the church's people are in, the Setup notice's demo line goes away, and so do the demo banners on Shepherding, Serve, Services, Events and Kids. Finance keeps its banner while its labeled demo books are there, because those numbers are made up; clear them from the banner.

**Who sees what.** Everyone signed in sees the directory: names, households, groups, member status and birthdays (month and day). Contact details, full dates and custom fields are for pastors, deacons and staff (the people who follow up). Notes are for pastors, deacons and staff; pastors-only notes for pastors. Adding, editing, merging, archiving and the migration tool need `people.edit` (pastors and staff); downloading the directory needs `people.export` (pastors and staff). The Kids check-in role sees none of it. Taking attendance is open to pastors, deacons and staff.

**Storage**: `ppl:{church}:*` (people, households, groups, attendance, notes, fields, imports). Code: `src/lib/people/`.

### Move your church to Barnabas

The migration tool (`/people/import`, pastors and staff) brings everything over in four files, in this order: people and households first (everything else is matched to them), then groups, attendance, and giving history (pastor or treasurer). Each file can be a `.csv` or an `.xlsx` workbook (the first sheet); workbooks are read in the browser with [SheetJS Community Edition](https://docs.sheetjs.com/) 0.20.3, installed from SheetJS's official CDN tarball (the npm `xlsx` 0.18 line is unmaintained), so the server only ever receives CSV.

1. **Choose where you're coming from**: ChurchTrac, Planning Center or another spreadsheet. The page shows that system's export steps for each file.
2. **Bring in each file.** Barnabas matches the header row tolerantly ("First Name", `first_name` and "FirstName"; "E-mail", "Home Email"; "Mobile Phone", "Cell", "Mobile Phone Number"; "Family", "Household Name"; "Member Status", "Membership"), and any column can be chosen by hand. Extra columns can be kept as custom fields.
3. **Check the preview**: counts of new, updated, already here and skipped rows, the reasons rows were skipped (no name, a repeat in the file, not in the directory yet, two people with that name, a date that couldn't be read, marked absent, a zero amount), and each row's outcome. **Dry run** gives the exact counts without saving anything.
4. **Import.** Each run is one batch in the **import log**, with who ran it and what it did, and any batch can be **undone** as a whole: what it added is removed, and what it changed is put back.

What it does with each file:

- **People and households**: a person is matched by their ID in the old system, then email, then mobile and name, then name and household, so running the same file again changes nothing, and a changed file updates people instead of adding them twice. Households are created from the family column and linked; a "Groups" column creates the groups and their members in the same step. Dates like `03/04/1980`, `3/4/80`, `Nov 3, 2026` and birthdays without a year are understood.
- **Groups**: a row per person per group; leaders are recognized from a role column (leader, host, teacher).
- **Attendance**: a row per person per service or group. A service is placed at the gathering its name or time matches (an 8:30 service on a Sunday goes to Sunday 8:30); an event that matches a group's name is that group's attendance. Only who was there is kept.
- **Giving history**: into Finance, one deposit per date, each gift linked to the directory by email or name (or kept by the giver's name), funds matched by name ("Tithes" and "Offering" go to General), and any fund the books don't have created as a restricted fund. Each gift's stable key means an overlapping export never counts a gift twice. Undo removes the gifts, their deposits and the funds it created (unless a deposit is in a finished reconciliation).

#### Exporting from ChurchTrac

These follow ChurchTrac's help center ([Using Reports](https://www.churchtrac.com/support/people/using-reports), [Getting Started With Giving](https://www.churchtrac.com/support/giving/using-the-giving-screen), [Attendance Reports](https://www.churchtrac.com/support/attendance/attendance-reports)):

1. **People and households**: open the **People** screen and its **Reports** tab. Pick a report that lists everyone with their details: **Member Directory**, or a report you build under **Setup → Custom Reports** with name, family, email, mobile phone, address, birthdate, anniversary, member status, membership date and groups. Include everyone (a Smart List of all people), choose **View Report**, then **Export to CSV** (next to View Report).
2. **Groups**: add the **Groups** field to that custom People report, and Barnabas creates each group and its members from it. ChurchTrac's help center doesn't document a separate group-roster export; a spreadsheet with a group column and a name column also works.
3. **Attendance**: on the Events/Attendance screen, open **Reports → Attendance Reports**, choose the start and end dates, the report and the groups, and view it. ChurchTrac documents these reports as print or PDF; if **Export to CSV** appears next to View Report, use it, otherwise ask ChurchTrac support for an attendance export or bring recent weeks over as a spreadsheet (Date, Name, Service).
4. **Giving**: open the **Giving** screen and its **Reports** tab, pick the date range at the top, choose a report that lists each contribution with its date, giver, amount and fund (not a totals report such as the Giving History Report), and run it as **CSV** (ChurchTrac generates most Giving reports as PDF or CSV).

#### Exporting from Planning Center

1. **People and households**: in Planning Center People, open the People page, choose **Actions → Import & Export CSV**, **Start Export**, then **Generate and send CSV**. Planning Center emails a link (good for 48 hours) to a CSV of every profile with its household ([Export data](https://help.planningcenter.com/en/138570-export-data.html)).
2. **Giving**: in Planning Center Giving, open **Donations → Reports**, the **By donation** tab, set the dates, and select the download arrow ([Giving reports](https://help.planningcenter.com/en/138359-giving-reports.html)).
3. **Groups and attendance**: export group member lists and check-ins as CSV; Barnabas needs a group (or event) column, a name or email column and, for attendance, a date.

**Exports** (**Reports → Exports**, `src/lib/exports/`) let the church take its data with it at any time: the whole directory with every field (`people.export`), serving rosters (everyone), event registrations (`events.manage`), giving by month and fund (`finance.view`) and giving by giver (`giving.donors`). Cells that start with `=`, `+`, `-` or `@` are escaped, and every export is in the audit log.

**The bank import's double-count risk is fixed.** Before, the bank CSV import matched duplicates by bank, date and amount only, and the client could turn that off, so importing the same file twice added everything again (and two real $20 deposits on one day looked like one). Now every bank row gets a stable key (bank account, date, amount, description, reference and its order among identical rows), computed over the whole file at preview; a key already in the books is never imported again, and deposits that look like an offering already entered in Giving are flagged and left unticked.

### Reports

**Reports** (`/reports`) shows how the church is doing, as totals:

| Section | What it shows | Who sees it |
|---|---|---|
| Attendance | Worship by Sunday (from the church database) and kids checked in | Everyone (kids counts with `kids.checkin`) |
| Giving vs budget | Giving this year, cumulative, against the budget's pace for the funds' income accounts, by month, and the same period last year; givers and new givers with `giving.donors` | `finance.view` |
| Co-laborer health | The weariness radar's "encourage" and "watch" counts over eight weeks, and serving load per team (slots per co-laborer, declines) | Everyone |
| Shepherding pipeline | Open cases by status and type, opened and closed by month, median days to first contact, cases with no contact yet; who holds what only with `care.view_all` | Pastors, deacons, staff |
| Guest follow-up | Guests by month, reached within 48 hours, came back, took a next step | Pastors, deacons, staff |
| Events | Percent full, waitlists and check-in rates | Everyone |
| Kids check-in | Children checked in by Sunday and rooms with ratio warnings | `kids.checkin` |

Every chart has a plain-language summary above it, a hover and keyboard tooltip, a "show the numbers as a table" view and a CSV download (`/api/reports/csv?section=…`, built with the same permission checks). Charts are inline SVG in the brand palette: the series colors (`--chart-1`, `--chart-2`: a Cypress teal and a Brass, separate steps for light and dark) were checked with the dataviz palette validator for color-vision separation and contrast against each mode's surface; the second series is also dashed and every multi-series chart has a legend, so nothing relies on color alone. Numbers are tabular. With empty data (the demo church), each section shows a warm empty state and the first step.

**Monthly ministry report** (`/reports/monthly`): a short narrative of the month from the same totals, drafted into Drafts as an email to the leader themselves, with the exact numbers appended by code. Barnabas can write the narrative in its own words (`draft_monthly_report`); it's checked against the memory policy, so shepherding, health and children's details are refused.

**Barnabas tools**: `how_are_we_doing` (any area or all; aggregates only, the same role checks) and `draft_monthly_report`. Code: `src/lib/reports/`.

### Mesa: the church-to-church network

Churches using Barnabas can connect on **Mesa** (`/network`) to share sermon series outlines, service templates, co-laborer training, event ideas, prayer needs marked shareable, and mission partner needs.

- **Consent on both sides**: an administrator of church A makes an invite code (single use, seven days, stored only as a hash) and gives it to church B; B's administrator enters it, which is B's approval; A's administrator approves. Either side can disconnect. Until both approve, nothing is visible either way.
- **Nothing about people leaves the church, enforced in code** (`src/lib/network/scrub.ts`): every title, body and tag is scrubbed before it's stored where another church can read it. Emails, phone numbers, street addresses, @handles and link tracking are removed, and so is every name the church knows: its directory, leaders, volunteers, guests, shepherding subjects, prayer requesters, children, guardians, pickups and event registrants. First names alone are removed too, except words that are also scripture, virtues or common words (James, Grace, Hope …), which are kept unless possessive ("Sarah's group"), so "a series on James" survives. Shared items carry the church's name, never the sharer's. The share screen previews exactly the scrubbed item, with what was removed, before **Share this**. Prayer needs can be started only from requests marked shareable, and only the request text goes.
- **Who**: an admin manages connections; pastors and staff share (`network.share`); everyone signed in can search.
- **Barnabas**: `search_network` ("find a church that's done a series on James") searches this church's and connected churches' items only.
- **Demo**: no connected churches by default. An admin can add one clearly fictional **Example church (demo)** with three sample resources, to see how it works, and remove it.

**The seam for a multi-tenant or federated Mesa.** There's one deployment today, so the whole network lives in this app's Redis (`mesa:profile:{church}`, `mesa:invite:{sha256(code)}`, `mesa:links:{church}`, `mesa:items:{church}`), each church's data under its own id. The service layer (`src/lib/network/service.ts`) never reads or writes another church's keys directly: everything between churches goes through the `NetworkTransport` interface in `src/lib/network/transport.ts` (`getProfile`, `saveInvite`/`takeInvite`, `links`/`deliverLink`, `items`/`publish`), implemented by `LocalTransport`. A federated version swaps in an HTTP transport: `deliverLink` becomes a signed request to the peer's Barnabas (the invite code would carry the peer's address and a public key), `publish` pushes to connected peers or serves a pull endpoint, and search fans out to connected peers' search endpoints. Consent (two admin approvals) and scrubbing stay on the sending side, in the service layer, either way, so a peer only ever receives already-scrubbed items.

### What ChurchTrac and Planning Center do that Barnabas doesn't yet

So a church knows what it still needs before it lets the old platform go:

- **Online giving processing**: card and bank (ACH) giving, text-to-give, recurring online gifts and processor payouts. Barnabas records gifts and statements; it doesn't take payments (Stripe is the planned seam).
- **Kids check-in hardware**: printing straight to label printers (DYMO, Brother) from a kiosk, self check-in kiosks and parent pagers. Barnabas prints labels through the browser.
- **Background checks** for co-laborers who serve with children (Planning Center integrates Protect My Ministry and Sterling Volunteers).
- **Worship planning**: a song library with CCLI reporting, chord charts, arrangements and keys, rehearsal media, and a live service-timing view (Planning Center Services).
- **Facilities**: room and resource booking with conflict checks and approval flows (Planning Center Calendar, ChurchTrac's rooms).
- **Member-facing apps**: a church app, member logins and self-service profile updates, an online photo directory, and group chat.
- **Website and forms**: a website builder, public forms beyond guest cards and event registration, and sermon media hosting and podcasts (ChurchTrac's sites and Church Connect).
- **Accounting beyond fund accounting**: payroll, accounts payable and check printing, and QuickBooks or ledger exports.
- **Bulk email and text campaigns** with lists and scheduling: Barnabas sends drafts one by one, each approved by a person.
- **Kids families in People**: Kids check-in still keeps its own family records, not yet linked to People households.

### Phase 4 environment variables

| Variable | What it's for |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio account; the auth token also verifies Twilio's webhook signatures |
| `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | Who texts come from (a Messaging Service linked to the A2P 10DLC campaign, or the number) |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend sending key and the From address on a verified domain |
| `RESEND_WEBHOOK_SECRET` | Verifies Resend's svix-signed delivery webhooks |
| `APP_URL` | The public address for status callbacks and unsubscribe links (`https://barnabas-three.vercel.app`) |

None is ever returned to the browser or logged: the app reports only which names are missing.

## Getting to know each leader

Barnabas works through twenty questions with every leader over many conversations, ranked so their ministry comes first (calling, biggest challenge, hope for the year, their role, the people they invest in) and their own rest, walk and support after. The list and its order are in `src/lib/engine/know.ts`.

The rules are enforced in code, not only in the instructions:

- Never in Barnabas's first reply of a conversation, never off the record, never in a turn where crisis language is detected.
- At most two per conversation, one per reply, unless the conversation has passed 15 exchanges.
- Once per conversation Barnabas may ask whether the leader minds a few more questions; only a clear yes on the next turn raises the limit (to five), and anything else ends it for that conversation.
- Barnabas must call `ask_to_know` with the specific reason the question fits what the leader just said; generic reasons are refused. A question already answered, or asked in the last two weeks, is refused.
- Answers are saved with `record_to_know` (privacy rules apply) to `/memories/getting-to-know-you.md`, one line per question. Barnabas reads that file at the start of every conversation to see what's still open, and the leader can edit or delete any line on the Memory screen.

## Before real congregants' data goes in

- **Sign-in** is a shared church access code plus email, enough for a pilot. Move to per-person accounts (for example Clerk or Auth.js with email links) before a wider rollout.
- **Data retention**: review Anthropic's API data retention settings for your organization; memory itself lives only in your Redis.
- **Church policy**: set `BARNABAS_ALLOW_SENSITIVE_MEMORY` to match your written policy (default `false`).
- **Messaging**: register for A2P 10DLC before texting anyone in the US, verify the email domain, and make sure the people you text have agreed to hear from the church by text (a connection card or sign-up form is the usual way). STOP replies and unsubscribes are honored automatically.
- **Care**: clear the demo care records, set roles in Settings → Team, and turn off any guest-card links you aren't using. Care notes follow `BARNABAS_ALLOW_SENSITIVE_MEMORY`.
- **Operations**: clear the demo rosters, rotation and events from their banners; add teams' volunteers, families and children; and give check-in volunteers the staff role (the station shows children's names and allergies). Stripe payments for events are not built yet.
- **Finance**: clear the demo books, set roles in Settings → Team, and have your accountant review the chart of accounts and opening balances. Fund transfers between funds, multiple fiscal-year start months and Stripe are not built yet.

## Next steps

1. Kids families linked to People households (Kids check-in keeps its own family records today), and serving teams imported with the migration tool.
2. Hands-free voice with a streaming speech service (for example Deepgram or AssemblyAI) and a higher-quality voice (for example ElevenLabs or Cartesia), keeping the same `/api/chat` stream.
3. Scheduled sends (for example serving reminders the evening before) that still need a person's Send on each draft.
4. Stripe Checkout for paid event registrations, at the `payment` seam on registrations.
5. Online giving (Stripe) so giving no longer needs another platform; see the gap list below.
6. An evaluation set of scripted conversations (latency, tool accuracy, memory precision, gate integrity, crisis handling) run before every prompt or model change.
