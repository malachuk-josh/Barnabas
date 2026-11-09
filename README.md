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
| Messages | Drafts with per-recipient translation (English, Spanish, Korean), review screen, confirmation gate checked in code | **Delivery isn't connected**: approved messages are queued in an outbox, not sent |
| Church data | The demo church's real leadership, teams, weekly schedule and events, with no made-up congregation: lists start empty with a first step to take | Planning Center adapter is the next step |
| Calendar | Month and agenda views, create, edit and delete; Barnabas adds and changes events when asked and must ask before deleting; Google and Outlook events and church events shown alongside | Google and Outlook two-way sync need a one-time app registration (below); Apple Calendar and any other app can subscribe to a private link |
| Finance | Overview, budget and plans, fund accounting (chart of accounts, funds, split transactions, bank reconciliation, CSV import), giving (batches, recurring givers, donor history, year-end statements), missions (partners, pledges, faith-promise campaigns) and printable reports; Barnabas answers budget, giving and missions questions and records gifts and expenses after a yes | See [Finance](#finance) below. The demo church starts with labeled demo books |
| Care | Pastoral care cases with a contact timeline, prayer requests, guest follow-up with a public guest card, the discipleship pathway and classes, and a private care-load tracker; Barnabas opens cases, logs contacts and records guests when asked, and asks before reassigning or closing | See [Care](#care) below. The demo church starts with example classes only; no one's care records are made up |
| Serve | Rosters per team per gathering (Sunday 8:30 and 10:45, 9:45 Growth Groups, Wednesday 6:00), sign-ups, swap requests, away dates, monthly limits, auto-fill and reminder drafts; the burnout radar reads real rosters | See [Operations](#operations-serve-services-events-and-kids). Reminders are drafts only |
| Services | Sermon series, the preaching rotation and orders of service with scripture linked into The Word | |
| Events | Registration forms, capacity and waitlist, a public sign-up link, attendee lists with CSV export, event-day check-in, and registration status on the Calendar | Online payment (Stripe) isn't built: paid events are settled at the door |
| Kids | Check-in station, 4" × 2" child labels with matching parent pickup tags, checkout by pickup code, room counts and ratio warnings, families with allergies and authorized pickups | Restricted to `kids.checkin` and `kids.admin`; Barnabas sees counts only |
| Roles | Pastor, treasurer, deacon, staff and leader, set by an admin in **Settings → Team**; checked in code on every finance request and tool call | Admins are bootstrapped with `BARNABAS_ADMIN_EMAILS` |
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

| Permission | Pastor | Treasurer | Deacon | Staff | Leader |
|---|---|---|---|---|---|
| See finance summaries, budgets, funds, missions and reports (`finance.view`) | Yes | Yes | Yes | No | No |
| Change budgets, transactions, gifts and missions records; import and reconcile (`finance.edit`) | Yes | Yes | No | No | No |
| See individual giving: donor names, gifts, pledges, statements (`giving.donors`) | Yes | Yes | No | No | No |
| See every care case, including confidential ones (`care.view_all`) | Yes | No | No | No | No |
| Assign care cases to someone else; keep the pathway and classes; make guest-card links (`care.assign`) | Yes | No | Yes | Yes | No |
| Schedule any team's roster, positions and volunteers (`ops.schedule`); a team's lead can always schedule their own team | Yes | No | No | Yes | No |
| Plan series, the preaching rotation and orders of service (`services.plan`) | Yes | No | No | Yes | No |
| Create events, see registrants, export and check people in (`events.manage`) | Yes | No | Yes | Yes | No |
| Run kids check-in: find families, check in and out, labels, room counts (`kids.checkin`) | Yes | No | No | Yes | No |
| Add and edit families and children, medical notes and pickups (`kids.admin`) | Yes | No | No | Yes | No |
| Set roles (`team.manage`) | Admins only (`BARNABAS_ADMIN_EMAILS`), whatever their role |

The check is `can(access, permission)` in `src/lib/auth/roles.ts`. API routes use `requirePermission()`; Barnabas's tools call the same check. The Finance navigation entry is hidden from roles without `finance.view`, and Kids from roles without `kids.checkin`. Everyone signed in can read rosters, the preaching rotation, orders of service and event counts, and sign up to serve. A check-in volunteer who isn't on staff needs the staff role for the station.

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
- **Guests**: guest cards (name, contact, how they heard, kids' ages, prayer request, interests). Each new card makes a thank-you text or email, drafted into the Drafts review queue within 24 hours (delivery isn't connected), a welcome call within 48 hours, and after a second visit an invitation to Discover Faith. Cards are assigned in rotation among the deacons and connections staff; anyone in a busy season (from the church's leadership notes) takes about half as many. Pastors, deacons and staff can make a **public guest-card link** (`/welcome/{token}`) that guests fill in on their own phone: the token is 32 random bytes looked up by its hash, links can be turned off, and submissions are rate-limited (5 per address per 10 minutes, 60 per link per hour) with a honeypot.
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
- **Reminders**: "Draft reminders" writes one draft per date with a personal line for each volunteer (their positions and times) into the **Drafts** review queue. Nothing is sent: delivery (Twilio and Resend) comes in Phase 4.
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

## Before real congregants' data goes in

- **Sign-in** is a shared church access code plus email, enough for a pilot. Move to per-person accounts (for example Clerk or Auth.js with email links) before a wider rollout.
- **Data retention**: review Anthropic's API data retention settings for your organization; memory itself lives only in your Redis.
- **Church policy**: set `BARNABAS_ALLOW_SENSITIVE_MEMORY` to match your written policy (default `false`).
- **Messaging** is not connected; Barnabas says so when it queues something.
- **Care**: clear the demo care records, set roles in Settings → Team, and turn off any guest-card links you aren't using. Care notes follow `BARNABAS_ALLOW_SENSITIVE_MEMORY`.
- **Operations**: clear the demo rosters, rotation and events from their banners; add teams' volunteers, families and children; and give check-in volunteers the staff role (the station shows children's names and allergies). Stripe payments for events and SMS and email delivery of reminders are not built yet.
- **Finance**: clear the demo books, set roles in Settings → Team, and have your accountant review the chart of accounts and opening balances. Fund transfers between funds, multiple fiscal-year start months and Stripe are not built yet.

## Next steps

1. Planning Center adapter (People, Services, Check-Ins) behind the `ChurchData` interface in `src/lib/chms/types.ts`.
2. Hands-free voice with a streaming speech service (for example Deepgram or AssemblyAI) and a higher-quality voice (for example ElevenLabs or Cartesia), keeping the same `/api/chat` stream.
3. SMS and email delivery (for example Twilio and Resend) from the outbox, including serving reminders (Phase 4).
4. Stripe Checkout for paid event registrations, at the `payment` seam on registrations.
5. Importing families, volunteers and teams from ChurchTrac or Planning Center (CSV first, then the adapter).
6. An evaluation set of scripted conversations (latency, tool accuracy, memory precision, gate integrity, crisis handling) run before every prompt or model change.
