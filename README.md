# Barnabas

A voice-first AI companion for church ministry leaders. Barnabas remembers each leader's people and plans across conversations, watches for weariness among co-laborers (Galatians 6:9), drafts messages in each member's language, and never sends anything without the leader's yes.

Built with Next.js on Vercel, Claude (Anthropic API) and Redis.

**Words.** Barnabas speaks of **co-laborers** (1 Corinthians 3:9), **encouraging** them (1 Thessalonians 5:11), **weariness** (Galatians 6:9) and **shepherding** (1 Peter 5:2), each verse quoted from the King James Version. The terms and verses live in one place, `src/lib/language.ts`, and `src/components/VerseNote.tsx` shows a verse under a heading the first time a term appears. Code identifiers, Redis keys, permission ids, API paths and tool names keep their older names.

## What's in this build

| Area | What works | Notes |
|---|---|---|
| Talk | Push-to-talk voice and text chat with streamed replies, spoken sentence by sentence; tap to interrupt | Voice uses the browser's built-in speech recognition and voices (Chrome, Edge, Safari). Firefox falls back to typing |
| Memory | Per-leader markdown files in Redis; notes saved during a call; organized by Claude's memory tool after each call; "What Barnabas remembers" screen with edit and delete | Deleting a conversation asks Barnabas to remove what it learned from it |
| Privacy | Off-the-record mode, code-enforced memory policy (no secrets; no health, counseling or family details unless the church opts in), crisis protocol with 988 | Rules are keyword-based in v1; see `src/lib/policy` |
| Encouraging co-laborers | Weariness watch combining load across teams, consecutive weeks, declines, the co-laborer's own worship and small-group attendance, and thank-you recency | Every flag shows its reasons and a suggested next step. The church's own leaders are never flagged as weary: a long run reads as "watch", with a thank-you and a Sunday off |
| Messages | Drafts with per-recipient translation (English, Spanish, Korean) and a review screen; a leader taps **Send** on a draft to deliver it by text (Twilio) or email (Resend), with delivery status, opt-outs and a send log | Barnabas drafts; only a person sends. See [Text and email delivery](#text-and-email-delivery) |
| People | The church's own database: people, households, contact details, member status, birthdays and anniversaries, groups, attendance, notes and custom fields, with duplicate merging and archive; a guided migration from ChurchTrac or Planning Center (.csv or .xlsx) with preview, dry run, import log and undo | See [People](#people-the-churchs-own-database) and [Move your church to Barnabas](#move-your-church-to-barnabas). Before anyone is added, the demo church's real leaders, teams, schedule and events, with no made-up congregation |
| Reports | Attendance, giving vs budget, co-laborer health, shepherding pipeline, guest follow-up, events and kids check-in, each with a chart, a text summary, a table and a CSV; a monthly ministry report drafted into Drafts | See [Reports](#reports) |
| Mesa | A consent-based network of churches sharing sermon series, service templates, training, event ideas and needs, never people | See [Mesa](#mesa-the-church-to-church-network) |
| Calendar | Month and agenda views, create, edit and delete; Barnabas adds and changes events when asked and must ask before deleting; Google and Outlook events and church events shown alongside | Google and Outlook two-way sync need a one-time app registration (below); Apple Calendar and any other app can subscribe to a private link |
| Finance | Overview, budget and plans, fund accounting (chart of accounts, funds, split transactions, bank reconciliation, CSV import), giving (batches, recurring givers, donor history, year-end statements), missions (partners, pledges, faith-promise campaigns) and printable reports; Barnabas answers budget, giving and missions questions and records gifts and expenses after a yes | See [Finance](#finance) below. The demo church starts with labeled demo books |
| Online giving | One-time and recurring gifts (weekly, every two weeks, monthly) on Stripe's hosted Checkout (card, ACH, Apple Pay, Google Pay), recorded in Finance by a signed webhook with fees and net; refunds, disputes and payouts; paid event registrations | See [Online giving (Stripe)](#online-giving-stripe). Off until `STRIPE_SECRET_KEY` is set |
| Shepherding | Shepherding needs with a contact timeline, prayer requests, guest follow-up with a public guest card, the discipleship pathway and classes, and a private care-load tracker; Barnabas notes needs, logs contacts and records guests when asked, and asks before reassigning a need or marking it met | See [Shepherding](#shepherding) below. The demo church starts with example classes only; no one's shepherding records are made up |
| Serve | Rosters per team per gathering (Sunday 8:30 and 10:45, 9:45 Growth Groups, Wednesday 6:00), sign-ups, swap requests, away dates, monthly limits, auto-fill and reminder drafts; the weariness watch reads real rosters | See [Operations](#operations-serve-services-events-and-kids). Reminders are drafts only |
| Services | Sermon series, the preaching rotation and orders of service with scripture linked into The Word | |
| Events | Registration forms, capacity and waitlist, a public sign-up link, attendee lists with CSV export, event-day check-in, and registration status on the Calendar | With Stripe connected, paid events are paid online through Stripe Checkout as people register; otherwise at the door. See [Online giving](#online-giving-stripe) |
| Kids | Check-in station, 4" × 2" child labels with matching parent pickup tags, checkout by pickup code, room counts and ratio warnings, families with allergies and authorized pickups | Restricted to `kids.checkin` and `kids.admin`; Barnabas sees counts only |
| Website | A church website builder at **Website** (`/site`): pages, a block editor, theme, draft and publish with a preview link and version history, a contact inbox; served at `/s` or on the church's own domain | See [Website](#website). The demo site is an unpublished draft (noindex) |
| Member app | A separate installable app for the congregation at `/m`: announcements, events with sign-up, sermons, give, plan a visit, prayer requests and contact; optional push notifications | See [Member app](#member-app). No member sign-in yet |
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
| Change budgets, transactions, gifts and missions records; import and reconcile; open funds for online giving and fetch Stripe payouts (`finance.edit`) | Yes | Yes | No | No | No | No |
| See individual giving: donor names, gifts, pledges, statements (`giving.donors`) | Yes | Yes | No | No | No | No |
| See every shepherding need, including confidential ones (`care.view_all`) | Yes | No | No | No | No | No |
| Assign shepherding needs to someone else; keep the pathway and classes; make guest-card links (`care.assign`) | Yes | No | Yes | Yes | No | No |
| Schedule any team's roster, positions and co-laborers (`ops.schedule`); a team's lead can always schedule their own team | Yes | No | No | Yes | No | No |
| Plan series, the preaching rotation and orders of service (`services.plan`) | Yes | No | No | Yes | No | No |
| Create events, see registrants, export and check people in (`events.manage`) | Yes | No | Yes | Yes | No | No |
| Run kids check-in: find families, check in and out, labels, room counts (`kids.checkin`) | Yes | No | No | Yes | No | Yes |
| Add and edit families and children, medical notes and pickups (`kids.admin`) | Yes | No | No | Yes | No | No |
| Send approved drafts by text or email (`messages.send`); deacons may send shepherding follow-ups (guest thank-yous and shepherding drafts) | Yes | No | Shepherding only | Yes | No | No |
| Add, edit, merge and archive people, households, groups and custom fields; run the migration tool (`people.edit`) | Yes | No | No | Yes | No | No |
| Download the church directory as CSV (`people.export`) | Yes | No | No | Yes | No | No |
| Share resources with connected churches on Mesa (`network.share`) | Yes | No | No | Yes | No | No |
| Edit and publish the church website and member app, read its inbox, post announcements (`site.edit`) | Yes | No | No | Yes | No | No |
| Set roles (`team.manage`); connect churches on Mesa | Admins only (`BARNABAS_ADMIN_EMAILS`), whatever their role |

The check is `can(access, permission)` in `src/lib/auth/roles.ts`. API routes use `requirePermission()`; Barnabas's tools call the same check. The Finance navigation entry is hidden from roles without `finance.view`, Kids from roles without `kids.checkin`, and Website from roles without `site.edit`. Everyone signed in can read rosters, the preaching rotation, orders of service and event counts, and sign up to serve. A kids check-in volunteer gets the **Kids check-in** role: the check-in station, room counts and labels, and their own profile, and nothing else (no Talk, The Word, Calendar, Shepherding, Finance or family records). Other pages send them to the station and other APIs return 403; the limit is checked on the server (`isCheckinOnly` / `checkinMayUse` in `src/lib/auth/roles.ts`, applied in `AppShell` and `requireLeader`). An administrator is never limited this way.

Shepherding needs (what the code calls cases) follow their own visibility rules (`src/lib/care/visibility.ts`), checked on every page, API call and Barnabas tool:

| Who | Sees |
|---|---|
| Pastor | Every need, including confidential ones |
| Deacon | Needs assigned to them, and every need that isn't confidential |
| Staff, treasurer, leader | Only needs assigned to them |
| Confidential needs | Pastors only, whoever they're assigned to; only a pastor can hold one |

Prayer requests marked shareable are visible to the whole team; private ones to the pastors and whoever added them. A need someone can't see reads as "not found".

## Finance

**Finance** (after Calendar) has seven views:

- **Overview**: year-to-date income vs expenses, the General fund balance and each restricted fund, giving this month vs the same days last year, budget health by ministry (on track, watch, over), and missions giving vs pledged. Each number says where it comes from.
- **Budget**: an annual budget per fiscal year (the calendar year) by account, entered monthly or annually, with actual, budget to date, variance, percent spent and health. Lines marked seasonal (insurance, a summer trip) are judged against the whole year. Plan notes, and copy last year's budget into a new year.
- **Funds and ledger**: the chart of accounts (assets, liabilities, income, expenses), funds (General unrestricted; Missions, Building and Benevolence restricted), transactions split into lines (account, fund, amount, memo), bank reconciliation against a statement balance, and CSV import from the bank with suggested accounts and duplicate checks. Payroll appears as expense accounts only: paychecks run through a payroll provider such as Gusto, and Barnabas doesn't calculate pay.
- **Giving**: gift records (a directory person or a new name; cash, check, online or ACH), Sunday batch entry posted as one deposit with a line per fund, recurring givers, donor history, printable year-end contribution statements, and a monthly trend chart. Online gifts from Stripe come in on their own (see [Online giving](#online-giving-stripe)).
- **Online giving**: Stripe's connection status (and a "Test mode" badge), setup steps, which funds are open for online giving, totals with fees and net, Stripe payouts with gross, fees and net, recent online gifts, new givers to review, and thank-you drafts.
- **Missions**: partners (missionaries and organizations, field, type, support level, monthly commitment, pledge dates, prayer updates), pledges toward a faith-promise campaign, and given vs pledged. It ties to the restricted Missions fund.
- **Reports**: a printable monthly finance report for the deacons or board (income and expense by category vs budget, fund balances, missions) and a giving report.

**Confidentiality.** Individual giving is visible to the pastor and treasurer only. Deacons see totals and trends, never names, in the app, the API and Barnabas. Barnabas shares one donor's totals only when the pastor or treasurer asks, and never their full ledger. Every finance write is in the audit log. Barnabas doesn't give tax or legal advice; it points to the church's accountant.

**Barnabas tools**: `finance_overview`, `budget_status`, `missions_status`, `giving_summary`, `online_giving_summary` (read-only), and `record_gift` and `record_expense`, which propose first and run only after the leader says yes on a later turn.

**Demo data.** The demo church gets a labeled demo dataset the first time Finance is opened, only while it has no finance data: a budget for a church of about 175, twelve months of transactions, giving recorded as anonymous offering lines (the Sunday plate, the online payout, missions, building and benevolence offerings) with no donor attached, and fictional missions partners. No donor, recurring gift or pledge is made up, so the donor list, statements and pledges start empty. A pastor or treasurer can clear it from the banner and start with empty books.

**Storage**: `fin:{church}:*` keys in Redis (chart, transactions and gifts by year, budgets by year, reconciliations, recurring givers, missions). Amounts are whole cents. Code: `src/lib/finance/`.

## Online giving (Stripe)

Gifts on the church's website and in the member app, and payment for paid events, through **Stripe's hosted Checkout**. Givers type card or bank details only on Stripe's page; no card data, Stripe.js or publishable key touches Barnabas. Off until `STRIPE_SECRET_KEY` is set; until then the Give block shows the church's giving link or "coming soon", and paid events are paid at the door.

**What givers see.** The Give block (the website's Give page, any page with a Give block, and the member app's Give tab, on the Barnabas domain or the church's own) shows a form: the funds a pastor or treasurer opened for online giving, an amount ($1 to $25,000), one time, weekly, every two weeks or monthly, and "add the processing fee so the church receives the full amount". It quotes 2 Corinthians 9:7 (KJV). **Give** goes to Stripe Checkout (cards, Apple Pay and Google Pay, and ACH bank payments); recurring gifts are Stripe subscriptions. After giving, the thank-you note offers **Manage a recurring gift** (the Stripe Customer Portal, opened from that Checkout session), and the form links to the portal's own email sign-in when `STRIPE_PORTAL_LOGIN_URL` is set. Stripe emails the receipt.

**What happens in the books** (`src/lib/finance/online.ts`). Stripe holds money between a gift and the payout, so online gifts go into a **Stripe balance (online giving)** clearing account (1050, a bank-type account), added on first use:

| Stripe reports | Barnabas records |
|---|---|
| A gift (`checkout.session.completed`, or `async_payment_succeeded` once ACH clears; each recurring payment's `invoice.paid`) | A gift record through Finance's gift posting: the giver, the fund, the gross, Stripe's fee, the net, the method (Online or ACH) and what the giver covered; a deposit into the Stripe balance; and the fee out to Bank and processing fees (5620) in the same fund. It's on the giver's year-end statement |
| A refund (`charge.refunded`, partial or full) | A reversing entry: a negative gift against the original (giving totals and the statement go down) and the money out of the Stripe balance |
| A dispute (`charge.dispute.created`, `charge.dispute.closed`) | The gift is flagged; if the dispute is lost, a reversing entry |
| A payout (`payout.paid`) | A transfer from the Stripe balance to the operating bank account, with the payout's gross, fees and net |
| An event payment | Event registrations income (4600, General fund) and its fee; the registration is marked paid. Not a gift |

Every entry carries a stable key from Stripe's ids (`stripe:{payment}`, `stripe-refund:{charge}:{refunded so far}`, `stripe-payout:{payout}`), and each webhook event is handled once by its id, so a replay never records anything twice. ACH gifts are recorded only when the bank payment clears; a failed one records nothing.

**Reconciling the bank.** **Finance → Online giving** lists payouts (from `payout.paid`, or **Fetch from Stripe**) with gross, fees, refunds and net. When the bank statement is imported, a deposit matching a payout (same amount within 3 days) is flagged "Looks like a Stripe payout already in the books" and left unticked, the same way a Sunday deposit already entered in Giving is, so online gifts are never counted twice. The Stripe balance account should match the Stripe dashboard's balance.

**Givers and People.** A giver is matched to People by email only: one person with that email, and the gift links to them; several, and it keeps the giver's name without linking; none, and a minimal person (name and email) is added, flagged "from online giving" under **New givers to review**, with any same-named person noted as a possible match. Nothing is ever merged automatically.

**Thank-you notes.** Optional: a pastor or treasurer turns on **Draft a thank-you for each online gift**, and each gift's thank-you email (with 2 Corinthians 9:7) goes into that leader's Drafts for review. Barnabas never sends it.

**Permissions.** Opening funds for online giving, fetching payouts and the thank-you setting need `finance.edit` (pastor, treasurer); online gift lists and new givers need `giving.donors`; deacons see totals and payouts; other roles, including kids check-in, see nothing. There's no refund or charge button and no Barnabas tool that moves money: refunds are made in the Stripe dashboard and reflected here by the webhook. `online_giving_summary` (Barnabas) returns totals only.

### Setting up Stripe

1. **Account.** At [dashboard.stripe.com](https://dashboard.stripe.com), create the church's account with business type **Nonprofit organization**, the church's legal name, EIN, a representative and the operating bank account, and finish verification (Settings → Business).
2. **Test mode first.** With **Test mode** on, copy the secret key (Developers → API keys, `sk_test_…`) into Vercel → Settings → Environment Variables as `STRIPE_SECRET_KEY`. A restricted key works too, with write access to Checkout Sessions and Customer portal and read access to PaymentIntents, Charges, Invoices (and invoice payments), Payouts and Balance transactions. Finance → Online giving then shows a **Test mode** badge.
3. **Webhook.** Developers → Webhooks → **Add endpoint**: `https://barnabas-three.vercel.app/api/stripe/webhook`, with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `invoice.paid`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `payout.paid`

   Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. Barnabas verifies every delivery's signature against the raw body and refuses anything else.
4. **Payment methods.** Settings → Payment methods: turn on Cards, Apple Pay, Google Pay and **ACH Direct Debit** (US bank account). For Apple Pay on the church's own domain, add the domain under Payment method domains. Settings → Emails: turn on **Successful payments** receipts (and refunds).
5. **Customer Portal.** Settings → Billing → Customer portal: allow customers to **cancel subscriptions** (at the end of the period), **update payment methods** and see invoice history; turn off plan switching; set the church's terms and privacy links; turn on the **login link** and copy it into `STRIPE_PORTAL_LOGIN_URL` (optional, so givers can manage a recurring gift by email any time).
6. **Redeploy**, then in **Finance → Online giving** open the funds for online giving. Give a test gift with card `4242 4242 4242 4242` (any future date, any CVC), a test ACH payment (test bank account `000123456789`, routing `110000000`), a monthly gift, and a refund from the dashboard, and watch each appear.
7. **Go live.** Switch the dashboard out of test mode, and repeat steps 2 and 3 with the live secret key and a live webhook endpoint (it has its own signing secret).
8. **Nonprofit rate.** Stripe offers a discounted processing rate to 501(c)(3) organizations: contact Stripe support (support.stripe.com) from the account and send the IRS determination letter (or other proof of 501(c)(3) status) and a note that most volume is donations. If granted, set `STRIPE_FEE_PERCENT` (for example `2.2`) so "cover the processing fee" estimates the new rate.

**Local testing.** `STRIPE_API_BASE` (ignored in production) points the Stripe client at a local stub server for development and tests. The Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) forwards real test-mode events.

**Storage**: online gifts, fees, refunds and payouts are in the books (`fin:{church}:*`); `stripe:evt:{id}` marks handled webhook events (90 days); `stripe:{church}:settings` and `stripe:{church}:payouts` hold the thank-you setting and the last 100 payouts. Code: `src/lib/stripe/`, `src/lib/finance/online.ts`, `src/lib/people/online.ts`, `src/app/api/stripe/webhook`, `src/app/api/s/give`, `src/app/api/finance/online`, `src/app/finance/online`, `src/components/site/GiveForm.tsx`.

## Shepherding

> "Feed the flock of God which is among you, taking the oversight thereof, not by constraint, but willingly; not for filthy lucre, but of a ready mind;" (1 Peter 5:2, KJV)

**Shepherding** (`/shepherding`, after Finance, a heart icon; under More on phones; once called Care, and the old `/care` links redirect) has five views:

- **Needs**: shepherding a person or household. Types: hospital, grief, illness, crisis, new baby, homebound, prayer, counseling referral, other. Status moves new → assigned → active → follow-up → met (stored as `closed`). Each need has who holds it (a pastor, deacon or other team member), a next step with a due date, a one-line summary, and a timeline of contacts (visit, call, text, card, meal) with a minimal note. A board by status or a list, filtered by mine or all, type and overdue.
- **Prayer**: who, the request, private or shareable, how many times the team has prayed, and answered.
- **Guests**: guest cards (name, contact, how they heard, kids' ages, prayer request, interests). Each new card makes a thank-you text or email, drafted into the Drafts review queue within 24 hours (a pastor, deacon or staff member sends it from there), a welcome call within 48 hours, and after a second visit an invitation to Discover Faith. Cards are assigned in rotation among the deacons and connections staff; anyone in a busy season (from the church's leadership notes) takes about half as many. Pastors, deacons and staff can make a **public guest-card link** (`/welcome/{token}`) that guests fill in on their own phone: the token is 32 random bytes looked up by its hash, links can be turned off, and submissions are rate-limited (5 per address per 10 minutes, 60 per link per hour) with a honeypot.
- **Next steps**: the discipleship pathway (first visit, Discover Faith class, salvation decision, baptism, membership class, membership, a Growth Group or Life Group, serving, giving), each step with a date, and who's ready for their next one with the reason (for example baptized but not a member, or attending 3+ months but not in a group). Discover Faith and membership classes with sessions, a teacher, enrollees, attendance, and completion, which records the pathway step.
- **My care load**: private to each person. Open needs by type and weight (crisis 3; grief, hospital and counseling referral 2; illness 1.5; others 1; prayer 0.5), contacts in the last 7 days, days without a day off (from "Rest / sabbath" calendar events and an "I took a day off" log), and a gentle signal: **steady**, **full** (one thing is full) or **stretched** (one thing is heavy, or two are full), always with its reasons and thresholds. Others see only the team view: total open needs and how evenly they're spread, as anonymous shares.

**Privacy.** Every note, next step, summary and prayer request goes through the same memory policy as Barnabas's memory (`checkMemoryText`): a need's type can say "illness", but notes can't hold diagnoses or other health, counseling, family, addiction, legal or money details unless the church sets `BARNABAS_ALLOW_SENSITIVE_MEMORY=true`. Secrets are never stored. Every shepherding write is in the audit log.

**Reminders.** Next steps and guest tasks appear in the Talk briefing under Follow-ups (overdue ones marked) and as suggestions on the Calendar, along with a day off when your load is full or stretched. Nothing is added to the calendar unless you add it.

**Barnabas tools**: `list_care_cases`, `care_case_detail`, `my_care_load`, `discipleship_next_steps` ("Who's ready for the membership class?") and `recent_guests` (read-only); `open_care_case`, `log_care_contact`, `add_prayer_request` and `record_guest`, which Barnabas does when asked and then says what it did; and `assign_care_case` (to someone else) and `close_care_case`, which propose first and run only after a yes on a later turn. Each conversation starts with the leader's own open needs, overdue next steps and care load. The older `log_care_event` tool still works and lands on the person's open need; earlier records from it are folded into needs once. The tool names keep the older word "case"; Barnabas says "need".

**Demo data.** The first time Shepherding is opened, the demo church gets only two labeled demo classes: Discover Faith taught by Eric Malachuk and the membership class taught by Ethan Malachuk, with no one enrolled. No one receiving care is made up: needs, prayer requests, pathways and guests start empty, each with a warm empty state and a first step. Nothing is made up about the real leadership, and no rest data is seeded for them. A pastor can clear the demo data from the banner. The leadership bios in Barnabas's context are our own summaries of the church's website plus details the church supplied.

**Storage**: `pcare:{church}:*` keys in Redis (cases, prayers, pathways, classes, guests, links, rotation), each leader's private day-off log at `pcare:{church}:rest:{leaderId}`, and public link lookups at `welcome:{sha256(token)}`. Code: `src/lib/care/`.

## Operations: Serve, Services, Events and Kids

Four areas after Shepherding in the navigation (under More on phones). The weekly gatherings they share are Sunday 8:30 and 10:45 worship, Sunday 9:45 Growth Groups, and Wednesday 6:00 Kids Club and Teen Group (`src/lib/ops/gatherings.ts`).

### Serve (scheduling co-laborers)

> "For we are labourers together with God: ye are God's husbandry, ye are God's building." (1 Corinthians 3:9, KJV)

- **Rosters** (`/serve`): pick a Sunday or Wednesday; each gathering shows every team that serves at it, each position and its slots, filled or open. Anyone signed in can **sign up** for an open slot (they join the team), say they **can't make it**, or **ask a teammate to cover**; the teammate accepts or declines, and on accept the roster updates. Schedulers and team leads **assign** from a list of who's free (best first: fewest Sundays in the last eight weeks), **fill open slots** automatically, and **remove** people.
- **Rules, enforced on every change**: no one serves two places at the same gathering; no one is scheduled on their **away dates** (blackouts); a co-laborer with a **monthly limit** is never scheduled on more distinct dates in a month than that, by hand, by auto-fill or by a swap. Availability is checked again when a swap is accepted.
- **Reminders**: "Draft reminders" writes one draft per date with a personal line for each co-laborer (their positions and times) into the **Drafts** review queue. Nothing is sent until a scheduler taps Send there (see [Text and email delivery](#text-and-email-delivery)).
- **My serving** (`/serve/mine`): your upcoming slots, swap requests waiting on you, and your away dates. **Teams and availability** (`/serve/teams`): positions (team leads edit their own team), co-laborers with their limits and away dates, and new teams (schedulers).
- **Weariness watch** ("And let us not be weary in well doing: for in due season we shall reap, if we faint not." Galatians 6:9, KJV): the watch on Talk now reads these rosters. Teams with roster data in the last eleven weeks use it; teams without any fall back to the church database's serving history. The church's own leaders are never flagged as weary: a long run reads as "watch", with a thank-you and a Sunday off.
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
- **Payments.** A paid event marks each registration's `payment` as `due` with the amount. With Stripe connected, the public sign-up sends the registrant to Stripe Checkout for the price times their party size and holds the spot for 60 minutes; Stripe's webhook marks it paid (a bank payment that's still clearing keeps the spot), and an unpaid hold past 60 minutes (or a failed bank payment) releases the spot and moves the waitlist up. Waitlisted registrations pay later. **Mark paid** at the door still works either way. See [Online giving](#online-giving-stripe).
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

- **Who sends** (`messages.send`): pastors and staff send any draft. Deacons carry the guest follow-up rotation and care visits, so they may send `care` drafts (guest thank-yous and shepherding follow-ups) and nothing else. Treasurers and leaders can draft with Barnabas; someone with `messages.send` sends. (`canSendDraft` in `src/lib/messages/permissions.ts`.)
- **Text** goes through Twilio's Messages API, **email** through Resend's Emails API, both with `fetch` (no SDKs). Contacts come from the draft, the guest card, the co-laborer record or the church directory, in that order; someone with no number or address on file is recorded as "no contact".
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
- **Attendance**: who was at each gathering (Sunday 8:30, 9:45, 10:45, Wednesday 6:00) and each group, by date (`/people/attendance`). It feeds Reports and the weariness watch.
- **Notes**: minimal notes on a person, held to the same memory policy as Barnabas's memory and Shepherding notes; a pastor can mark one pastors-only.
- **Duplicates** (`/people/duplicates`): people with the same email, mobile number or name. Merging keeps one record, fills its blanks from the other, moves groups, attendance and notes, and points Shepherding needs, serving and giving at the kept record. Links to the merged record keep working.
- **Archive**: someone who has moved away leaves the directory and lists; their history stays, and they can be restored.

**One set of people for everything.** The People database is the `ChurchData` source (the native adapter, `src/lib/people/native.ts`): Shepherding, Serve, the weariness watch, Finance donors, Reports, Mesa's scrubber and every Barnabas tool read the same people. Until the first person is added, Barnabas uses the demo church: Mount Greylock's published leaders and schedule, with no made-up congregation. Once the church's people are in, the Setup notice's demo line goes away, and so do the demo banners on Shepherding, Serve, Services, Events and Kids. Finance keeps its banner while its labeled demo books are there, because those numbers are made up; clear them from the banner.

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
| Co-laborer health | The weariness watch's "encourage" and "watch" counts over eight weeks, and serving load per team (slots per co-laborer, declines) | Everyone |
| Shepherding pipeline | Open needs by status and type, noted and met by month, median days to first contact, needs with no contact yet; who holds what only with `care.view_all` | Pastors, deacons, staff |
| Guest follow-up | Guests by month, reached within 48 hours, came back, took a next step | Pastors, deacons, staff |
| Events | Percent full, waitlists and check-in rates | Everyone |
| Kids check-in | Children checked in by Sunday and rooms with ratio warnings | `kids.checkin` |

Every chart has a plain-language summary above it, a hover and keyboard tooltip, a "show the numbers as a table" view and a CSV download (`/api/reports/csv?section=…`, built with the same permission checks). Charts are inline SVG in the brand palette: the series colors (`--chart-1`, `--chart-2`: a Cypress teal and a Brass, separate steps for light and dark) were checked with the dataviz palette validator for color-vision separation and contrast against each mode's surface; the second series is also dashed and every multi-series chart has a legend, so nothing relies on color alone. Numbers are tabular. With empty data (the demo church), each section shows a warm empty state and the first step.

**Monthly ministry report** (`/reports/monthly`): a short narrative of the month from the same totals, drafted into Drafts as an email to the leader themselves, with the exact numbers appended by code. Barnabas can write the narrative in its own words (`draft_monthly_report`); it's checked against the memory policy, so shepherding, health and children's details are refused.

**Barnabas tools**: `how_are_we_doing` (any area or all; aggregates only, the same role checks) and `draft_monthly_report`. Code: `src/lib/reports/`.

### Mesa: the church-to-church network

Churches using Barnabas can connect on **Mesa** (`/network`) to share sermon series outlines, service templates, co-laborer training, event ideas, prayer needs marked shareable, and mission partner needs.

- **Consent on both sides**: an administrator of church A makes an invite code (single use, seven days, stored only as a hash) and gives it to church B; B's administrator enters it, which is B's approval; A's administrator approves. Either side can disconnect. Until both approve, nothing is visible either way.
- **Nothing about people leaves the church, enforced in code** (`src/lib/network/scrub.ts`): every title, body and tag is scrubbed before it's stored where another church can read it. Emails, phone numbers, street addresses, @handles and link tracking are removed, and so is every name the church knows: its directory, leaders, co-laborers, guests, shepherding subjects, prayer requesters, children, guardians, pickups and event registrants. First names alone are removed too, except words that are also scripture, virtues or common words (James, Grace, Hope …), which are kept unless possessive ("Sarah's group"), so "a series on James" survives. Shared items carry the church's name, never the sharer's. The share screen previews exactly the scrubbed item, with what was removed, before **Share this**. Prayer needs can be started only from requests marked shareable, and only the request text goes.
- **Who**: an admin manages connections; pastors and staff share (`network.share`); everyone signed in can search.
- **Barnabas**: `search_network` ("find a church that's done a series on James") searches this church's and connected churches' items only.
- **Demo**: no connected churches by default. An admin can add one clearly fictional **Example church (demo)** with three sample resources, to see how it works, and remove it.

**The seam for a multi-tenant or federated Mesa.** There's one deployment today, so the whole network lives in this app's Redis (`mesa:profile:{church}`, `mesa:invite:{sha256(code)}`, `mesa:links:{church}`, `mesa:items:{church}`), each church's data under its own id. The service layer (`src/lib/network/service.ts`) never reads or writes another church's keys directly: everything between churches goes through the `NetworkTransport` interface in `src/lib/network/transport.ts` (`getProfile`, `saveInvite`/`takeInvite`, `links`/`deliverLink`, `items`/`publish`), implemented by `LocalTransport`. A federated version swaps in an HTTP transport: `deliverLink` becomes a signed request to the peer's Barnabas (the invite code would carry the peer's address and a public key), `publish` pushes to connected peers or serves a pull endpoint, and search fans out to connected peers' search endpoints. Consent (two admin approvals) and scrubbing stay on the sending side, in the service layer, either way, so a peer only ever receives already-scrubbed items.

### What ChurchTrac and Planning Center do that Barnabas doesn't yet

So a church knows what it still needs before it lets the old platform go:

- **Text-to-give** and kiosk giving. Card, bank (ACH) and recurring online giving, and payouts, run through Stripe (see [Online giving](#online-giving-stripe)).
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
| `CHURCH_SITE_HOST` | The church's own domain(s) for the public website, comma-separated (see [Website](#website)) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for image uploads in the website editor (set by connecting a Blob store) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional web push: leaders' notifications and member-app announcements (see Notifications) |
| `CRON_SECRET` | Protects the hourly cron job that sends the morning briefing (see Notifications) |

None is ever returned to the browser or logged: the app reports only which names are missing. (The VAPID public key is the one exception: browsers need it to subscribe, and it's public by design.)

## Notifications

Barnabas sends leaders push notifications, on by default. Each leader can turn them all off, or any one kind, in **Settings → Notifications**; turning them off keeps their devices set up so turning them back on just works. A browser only lets a page subscribe after the person taps to allow it, so Today shows a small card ("Turn on notifications so Barnabas can let you know when someone needs you") until this device is set up; Dismiss hides it on that device for 14 days.

What Barnabas notifies about (each its own toggle, all on by default, sent only to the leaders who can already see the thing under the usual roles and visibility rules):

| Kind | When | Who |
| --- | --- | --- |
| Morning briefing | About 7:00 AM in the leader's own time zone (Settings → time zone), and only on days something is waiting: needs whose next step is due today or overdue, newly assigned needs, guest follow-ups due, requests to cover a slot. Counts only. | Every leader with something due |
| Shepherding | A need assigned to you by someone else; a guest card you're following up; a prayer request from the website or member app | The assignee; for prayer requests, whoever can see the request (shareable: the team; private: the pastors) |
| Serving | Someone asks you to cover a slot; someone accepts your swap request | The person asked; the person who asked |
| Event registrations | A new public registration, collapsed into one notification per event with a running count | The leader who created the event (or everyone with events access if they no longer have it) |
| Website inbox | A new contact-form message | Pastors and staff (site editors) |
| Kids check-in | A checkout refused because the person wasn't on the family's pickup list | Pastors and staff who keep family records |

The kids check-in role gets the master switch only. **Privacy:** notifications carry counts and first names at most: never a need's type or notes, the words of a prayer or message, health details, pickup codes or giving amounts, and a confidential need has no name at all ("A confidential need was assigned to you.").

**Setup (once):**

1. Generate VAPID keys: `npx web-push generate-vapid-keys`. If you already set up member-app push, reuse those keys: both apps share them (each keeps its own subscriptions).
2. In Vercel → Settings → Environment Variables, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (e.g. `mailto:office@yourchurch.org`).
3. Set `CRON_SECRET` to a random string of at least 16 characters (`openssl rand -hex 32`). Vercel Cron sends it as `Authorization: Bearer …` to `/api/cron/notify`, which `vercel.json` schedules hourly (`0 * * * *`); each run sends the briefing to leaders for whom it's 7 AM. Hourly cron jobs need a Vercel Pro (or Enterprise) plan; on Hobby, crons run at most once a day.
4. Redeploy. Without the VAPID keys, Settings says push isn't set up yet and the Today card doesn't appear; without `CRON_SECRET` the cron route answers 503 and only the morning briefing is missing.

**iPhone and iPad:** web notifications work only from the Home Screen app (iOS 16.4 or later). Open Barnabas in Safari, tap Share → **Add to Home Screen**, open Barnabas from the Home Screen, then tap **Turn on** on Today (or Settings → Notifications → Turn on for this device) and allow. If notifications were blocked, turn them back on in the iPhone's Settings → Notifications → Barnabas. Android, Windows and Mac browsers can turn them on straight from the page.

Under the hood: `public/sw.js` is the leader app's service worker (scope `/`, no caching, no fetch handler), registered from the app shell; the member app keeps its own at `/m/sw.js`. Subscriptions are stored per leader and device (at most 10), and ones the push service reports gone (404/410) are pruned. Test sends are recorded in the audit log.

## Website

**Website** (a globe icon; under More on phones) is shown to roles with `site.edit` (pastors and staff). Kids check-in co-laborers never see it, and the builder's API answers them with 403.

- **Pages** (`/site`): home, about and leadership, plan a visit, service times, events, sermons, give and contact, plus custom pages. Reorder them (home stays first), add, remove, and choose which show in the menu.
- **Block editor** (`/site/edit/{page}`): add, reorder (up and down buttons), edit and remove blocks. Blocks: hero (heading, text, picture, up to three buttons), text (bold, italic, headings, lists, quotes, links), image, two columns, service times (read from the weekly schedule), upcoming events (from Events and the church calendar, with a Register button where registration is open), leadership (names and titles from the leadership list, with website bios), sermon series (from Services), plan a visit (with the guest card), give, contact form, map (an address, no API key), video (YouTube and Vimeo only) and announcement. Every block is validated with zod (`src/lib/site/types.ts`) in the browser and again on the server; images need alt text.
- **Theme** (`/site/theme`): church name, tagline, logo, colors (starting from the Barnabas palette: Cypress #1E4543, Brass #D9A441, Sea glass, Chalk #F3F6F4, Night #0F2423), fonts (Young Serif and Figtree by default, or a short list of Google fonts), footer, contact details and social links. The editor shows each color pair's contrast; publishing is refused below WCAG AA (4.5:1). Navigation is the page list.
- **Draft and publish**: every edit goes to the draft. **Publish** copies it to what visitors see. **Preview draft** (`/s?preview=1`) is for leaders with `site.edit`; **Share a preview link** (`/s?preview={token}`) lets anyone see the draft without signing in, and a new link turns the old one off. **History** keeps the last 25 saves, publishes and restores; **Restore** copies a version into the draft. Every write is in the audit log.
- **Inbox** (`/site/inbox`): contact-form messages, marked answered or deleted. A contact block can also draft a reply into the Drafts review queue (for the leader who last published). Prayer requests from the site go to Shepherding → Prayer, private to the pastors unless the person ticks "OK to share with the prayer team", under the same memory policy as the guest card. Guest cards go to Shepherding → Guests through the same flow as `/welcome`.
- **Images**: with Vercel Blob set up, the editor uploads PNG, JPEG, WebP or GIF up to 4 MB (checked by their bytes, not only their type; SVG is refused). Without it, paste an https image address.
- **Barnabas tools**: `website_content` ("What's on our website?") reads the published site, and `post_announcement` proposes an announcement and posts it only after the leader says yes on a later turn (`site.edit` only).

**Public site** (`/s`, or the church's own domain): server-rendered, with titles, descriptions, Open Graph tags, a canonical link, `sitemap.xml` and `robots.txt`; skip link, landmarks and labeled forms; responsive down to 360px; light by default whatever the device's setting.

- **Until an admin publishes**, `/s` is a 404 for visitors and shows the draft only to signed-in leaders (not kids check-in co-laborers), with a banner. Every page is `noindex`, `robots.txt` disallows everything and the sitemap is empty. Previews are always `noindex`.
- **What it shows**: only what's published plus public-facing data: the weekly schedule, event titles, times, places, descriptions and public sign-up links, leaders' names and titles, preaching dates, preachers, series and passages. Leaders' bios come from the website's own text, never from church records. No registrants, rosters, care, giving or People records.
- **Safety**: rich text is reduced to a small allowlist of tags (`src/lib/site/sanitize.ts`) when it's saved and again when it's rendered; it's the only HTML the site injects. Links must be https, http, mailto, tel or a site path. Videos are embedded only from YouTube (no-cookie) and Vimeo, built from the video id.
- **Forms** (`/api/s/contact`, `/api/s/prayer`, `/api/s/guest`, `/api/s/push`): no sign-in; open only once the site is published (or for a signed-in leader trying the draft); 5 per address per 10 minutes and 200 per hour overall per form; a hidden honeypot field makes a bot's submission a silent no-op; they answer only whether it worked.
- **Giving**: `giveTarget()` in `src/lib/site/give.ts` decides what the Give block, Give page and the app's Give tab show. With Stripe connected it's Barnabas's give form (see [Online giving](#online-giving-stripe)); otherwise a link to the church's existing giving page (set in **Member app and giving**) or "Online giving is coming soon".
- **The Word**: passage references show as text, because The Word needs a sign-in. If it's opened to the public, set `WORD_IS_PUBLIC` in `src/lib/site/data.ts` and references link to `/word?b=&c=&v=`.

### Using the church's own domain

1. In Vercel, open the project → **Settings → Domains**, and add the church's domain, for example `www.mountgreylockbaptist.com` (and the bare `mountgreylockbaptist.com`, redirecting to `www`).
2. At the domain's DNS provider, add the records Vercel shows: usually a `CNAME` for `www` to `cname.vercel-dns.com`, and an `A` record for the bare domain to `76.76.21.21`. Wait for Vercel to show the domain as valid (it issues the certificate).
3. In **Settings → Environment Variables**, set `CHURCH_SITE_HOST=www.mountgreylockbaptist.com,mountgreylockbaptist.com` and redeploy.
4. Publish the site from **Website**.

On that domain the middleware serves the website at the root (`/about`, `/visit`, `/sitemap.xml`, `/robots.txt`), the member app at `/m`, and the public sign-up and guest-card links. Every other path is rewritten under the site (so `/finance` is a 404 there), and the leader app's API answers 404. Leaders keep using `https://barnabas-three.vercel.app`; sign-in cookies never go to the church's domain.

**Storage**: `site:{church}:*` keys in Redis (meta, draft, published, versions, inbox, announcements, push). Code: `src/lib/site/`, `src/components/site/`, `src/app/site/` (builder), `src/app/s/` (public site), `src/app/m/` (member app), `src/app/api/site/` and `src/app/api/s/`.

## Member app

A separate app for the congregation at `/m`, with its own web manifest (`/m/manifest.webmanifest`: the church's name, an icon drawn from its initials or its own icon, `start_url` `/m` and scope `/m/`), so members can **Add to Home Screen** and get the church's app, not Barnabas.

- **Tabs**: Home (announcements and the next gatherings), Events (with Register links), Sermons (series, preachers and passages), Give (the giving seam) and Connect (plan a visit with the guest card, a prayer request that goes to Shepherding, and a contact form). Leaders choose which tabs show.
- **Leader side** (`/site/app`): the app's name, home-screen name, icon, welcome line and tabs (published with the site); announcements; a share link and a QR code (SVG, drawn in code with `uqr`) for "get our app".
- **Push notifications (optional)**: with VAPID keys set, members can tap "Notify me about announcements" (on iPhone, after adding the app to the home screen), and a leader can send an announcement as a notification after confirming. Without the keys the button is hidden and the leader side says push isn't set up. To set it up, run `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (for example `mailto:office@yourchurch.org`) in Vercel and redeploy. The private key stays on the server.
- **No member sign-in yet.** The seam is `src/lib/site/member.ts`: sign-in by email link (a one-time link sent through the Resend sender in `src/lib/messages`, matched to a People record by email, setting a separate member cookie scoped to `/m`) plugs in there.
- **Not published yet**: like the site, the app shows only to signed-in leaders until the site is published.

### Vercel Blob (image uploads)

In the Vercel project, open **Storage → Create → Blob**, connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`), and redeploy. Without it the editor accepts image addresses only.

## A thorn in the flesh: the leader's own health

Health details are never saved as notes. When a leader mentions their own chronic condition or ongoing struggle that bears on their ministry, Barnabas responds with care, then asks whether they'd like him to remember it "as a thorn in the flesh" (2 Corinthians 12:7, KJV) or keep it private. It is enforced in code (`src/lib/engine/thorn.ts`): the first `remember_thorn` call saves nothing; only the leader's very next message, with a clear yes about the same detail, saves it to `/memories/thorn-in-the-flesh.md`. Anything else, including "keep it private", stores nothing. Never off the record, never in a crisis moment, and only for the leader themselves (congregants' health follows the church's memory policy). `save_memory` and getting-to-know-you answers refuse the leader's own health details, and the after-conversation memory job may not touch that file. Barnabas reads it at the start of each conversation; the leader can edit or delete it on the Memory screen.

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
- **Shepherding**: clear the demo shepherding records, set roles in Settings → Team, and turn off any guest-card links you aren't using. Shepherding notes follow `BARNABAS_ALLOW_SENSITIVE_MEMORY`.
- **Operations**: clear the demo rosters, rotation and events from their banners; add teams' co-laborers, families and children; and give check-in co-laborers the staff role (the station shows children's names and allergies).
- **Website**: replace the placeholder words ("Add your church's story here"), check the leaders' website bios, add a logo and photos, then publish from **Website**. Nothing is public until you do.
- **Finance**: clear the demo books, set roles in Settings → Team, and have your accountant review the chart of accounts and opening balances. Fund transfers between funds and multiple fiscal-year start months are not built yet.
- **Online giving**: run Stripe in test mode first (a test gift, a test refund, a test ACH payment), then switch to live keys.

## Next steps

1. Kids families linked to People households (Kids check-in keeps its own family records today), and serving teams imported with the migration tool.
2. Hands-free voice with a streaming speech service (for example Deepgram or AssemblyAI) and a higher-quality voice (for example ElevenLabs or Cartesia), keeping the same `/api/chat` stream.
3. Scheduled sends (for example serving reminders the evening before) that still need a person's Send on each draft.
4. Text-to-give, and matching Stripe's dispute fees and payout adjustments into the books automatically.
5. An evaluation set of scripted conversations (latency, tool accuracy, memory precision, gate integrity, crisis handling) run before every prompt or model change.
