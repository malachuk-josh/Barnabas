# Barnabas

A voice-first AI companion for church ministry leaders. Barnabas remembers each leader's people and plans across conversations, watches for volunteer burnout, drafts messages in each member's language, and never sends anything without the leader's yes.

Built with Next.js on Vercel, Claude (Anthropic API) and Redis.

## What's in this build

| Area | What works | Notes |
|---|---|---|
| Talk | Push-to-talk voice and text chat with streamed replies, spoken sentence by sentence; tap to interrupt | Voice uses the browser's built-in speech recognition and voices (Chrome, Edge, Safari). Firefox falls back to typing |
| Memory | Per-leader markdown files in Redis; notes saved during a call; organized by Claude's memory tool after each call; "What Barnabas remembers" screen with edit and delete | Deleting a conversation asks Barnabas to remove what it learned from it |
| Privacy | Off-the-record mode, code-enforced memory policy (no secrets; no health, counseling or family details unless the church opts in), crisis protocol with 988 | Rules are keyword-based in v1; see `src/lib/policy` |
| Volunteer care | Burnout radar combining load across teams, consecutive weeks, declines, the volunteer's own worship and small-group attendance, and thank-you recency | Every flag shows its reasons and a suggested next step |
| Messages | Drafts with per-recipient translation (English, Spanish, Korean), review screen, confirmation gate checked in code | **Delivery isn't connected**: approved messages are queued in an outbox, not sent |
| Church data | A demo congregation (18 people, 6 teams) so everything works before a ChMS is connected | Planning Center adapter is the next step |
| Calendar | Rest and sabbath holds, confirmed before saving | Stored in Barnabas only; no calendar sync yet |

Design and research: [`docs/barnabas-voice-harness.md`](docs/barnabas-voice-harness.md), [`reports/`](reports/).

## How a voice turn works

1. The leader taps the mic. The app starts a conversation, which freezes the leader's memory and today's briefing into Barnabas's instructions and warms Claude's prompt cache in the background.
2. The browser transcribes speech. When the leader stops, the transcript goes to `POST /api/chat`.
3. The server appends the turn (history is append-only), streams Claude, and runs tools. Text streams back as newline-delimited JSON.
4. The browser speaks each finished sentence. When a lookup starts, it plays a short holding phrase ("Let me check the schedule").
5. If the leader interrupts, playback stops. The server still finishes and saves the full reply, and the next turn tells Claude what the leader actually heard.
6. When the conversation ends, a background job runs Claude with the memory tool to fold what it learned into the leader's memory files.

Key code: `src/lib/engine/turn.ts` (turn loop), `src/lib/engine/claude.ts` (request shape and caching), `src/lib/engine/tools.ts` (tools and confirmation gates), `src/lib/engine/memory-jobs.ts` (memory consolidation and forgetting), `src/lib/memory/fs.ts` (memory files in Redis), `src/components/Talk.tsx` (browser voice).

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
   - Optional: `BARNABAS_CHURCH_NAME`, `BARNABAS_MODEL`, `BARNABAS_EFFORT`, `BARNABAS_ALLOW_SENSITIVE_MEMORY` (see `.env.example`)
4. Redeploy. The app refuses to start sign-in without `SESSION_SECRET` and `BARNABAS_ACCESS_CODE`, and refuses to run without Redis in production, so a missing setting fails closed instead of exposing data.

The streaming chat route runs up to 60 seconds per turn and memory consolidation up to 120 seconds (`maxDuration` in each route). Leave Fluid compute on (the Vercel default).

## Before real congregants' data goes in

- **Sign-in** is a shared church access code plus email, enough for a pilot. Move to per-person accounts (for example Clerk or Auth.js with email links) before a wider rollout.
- **Data retention**: review Anthropic's API data retention settings for your organization; memory itself lives only in your Redis.
- **Church policy**: set `BARNABAS_ALLOW_SENSITIVE_MEMORY` to match your written policy (default `false`).
- **Messaging and calendar** are not connected; Barnabas says so when it queues something.

## Next steps

1. Planning Center adapter (People, Services, Check-Ins) behind the `ChurchData` interface in `src/lib/chms/types.ts`.
2. Hands-free voice with a streaming speech service (for example Deepgram or AssemblyAI) and a higher-quality voice (for example ElevenLabs or Cartesia), keeping the same `/api/chat` stream.
3. SMS and email delivery (for example Twilio and Resend) from the outbox.
4. An evaluation set of scripted conversations (latency, tool accuracy, memory precision, gate integrity, crisis handling) run before every prompt or model change.
