# AEGIS

Mobile-first AI operations command app built with Next.js. The app supports two storage modes:

- `DEMO_MODE=true`: in-memory demo repository
- `DEMO_MODE=false`: real Supabase/Postgres persistence through a server-only repository layer

## What is included

- Multi-tenant workspace model with seeded demo companies:
  - Forklift Pro Solutions
  - Yorkshire Hamper Co.
- Mobile-first dark UI modeled on the provided AEGIS mockup
- Chat-driven AEGIS assistant with workspace-aware context
- Voice record flow with server-side transcription hook and server-side TTS hook
- Approval queue for SMS, calls, email, web, and bulk actions
- Twilio-ready SMS and outbound call routes
- CRM, follow-up tasks, scheduled jobs, automations, settings, and audit log scaffolding
- Supabase/Postgres SQL migration and seed files
- Repository switcher for demo memory vs real Supabase persistence
- Demo mode so the app runs locally without live API keys
- Optional Base44 connector for live ForkliftPro inventory, customers, parts, sales, and business context

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Server-side fetch wrappers for OpenAI and Twilio
- Supabase/Postgres schema files in `supabase/`

## Run locally

1. In [`.env.example`](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/.env.example), copy the variables into a local `.env.local`.
2. Keep `DEMO_MODE=true` for a no-credential local run.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Realtime phone voice

For the lowest-latency phone experience, AEGIS can stream Twilio call audio directly into OpenAI Realtime.

1. Set these in `.env.local`:
   - `TWILIO_REALTIME_ENABLED=true`
   - `OPENAI_REALTIME_MODEL=gpt-realtime-1.5`
   - `OPENAI_REALTIME_VOICE=cedar`
   - `TWILIO_MEDIA_STREAM_URL=wss://your-public-domain/media-stream`
   - `TWILIO_MEDIA_STREAM_PORT=3001`
2. Make sure your public tunnel routes `/media-stream` to local port `3001`
3. Start both the Next app and the realtime bridge:

```bash
npm run dev:voice
```

If the realtime bridge is disabled, the app falls back to the clip-based OpenAI TTS phone route.

## Production deploy

For reliable public calling and SMS, split the stack:

- Vercel hosts the Next.js app
- Render hosts the Twilio realtime voice bridge

### 1. Deploy the app to Vercel

Deploy this Next.js app to Vercel from GitHub.

Set these environment variables in Vercel:

- `DEMO_MODE=false`
- `AEGIS_RELEASE_VERSION=$VERCEL_GIT_COMMIT_SHA` if you want an explicit shared release marker in logs and health checks
- `NEXT_PUBLIC_APP_URL=https://aegis.yourdomain.com`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-5-mini`
- `OPENAI_SPEECH_MODEL=gpt-4o-mini-tts`
- `BASE44_APP_ID=...`
- `BASE44_API_KEY=...`
- `BASE44_WORKSPACE_ID=22222222-2222-2222-2222-222222222221`
- `FORKLIFT_WEBSITE_BASE_URL=https://your-forklift-site.example`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_PHONE_NUMBER=+447367172076`
- `TWILIO_REALTIME_ENABLED=true`
- `TWILIO_MEDIA_STREAM_URL=wss://voice.yourdomain.com/media-stream`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `AEGIS_PHONE_SYNC_SECRET=shared-secret-used-by-vercel-and-render`

### 2. Deploy the voice bridge to Render

This repo includes [render.yaml](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/render.yaml) for the voice bridge service.

Render service details:

- service type: `Web Service`
- runtime: `Node`
- build command: `npm ci`
- start command: `npm run voice:bridge:prod`
- health check: `/health`

Set these environment variables in Render:

- `AEGIS_RELEASE_VERSION=$RENDER_GIT_COMMIT` if you want an explicit shared release marker in logs and health checks
- `OPENAI_API_KEY=...`
- `OPENAI_REALTIME_MODEL=gpt-realtime-1.5`
- `OPENAI_REALTIME_VOICE=cedar`
- `BASE44_APP_ID=...`
- `BASE44_API_KEY=...`
- `AEGIS_SYNC_URL=https://aegis.yourdomain.com`
- `AEGIS_PHONE_SYNC_SECRET=shared-secret-used-by-vercel-and-render`

Render will provide:

- `PORT`
- public HTTPS domain such as `https://aegis-voice-bridge.onrender.com`

Use that Render domain to form the media stream URL:

- `wss://aegis-voice-bridge.onrender.com/media-stream`

### 3. Wire Twilio to the public app

On your Twilio number:

- Voice webhook:
  - `https://aegis.yourdomain.com/api/twilio/voice-script`
  - method: `POST`
- Messaging webhook:
  - `https://aegis.yourdomain.com/api/twilio/sms`
  - method: `POST`

The Next.js app will return TwiML that tells Twilio to connect the call audio to the Render-hosted realtime bridge over WebSocket.

### 4. DNS layout

Recommended:

- `aegis.yourdomain.com` -> Vercel app
- `voice.yourdomain.com` -> Render voice bridge

### 5. Important note

This repo currently has no Git remote configured, so deployment cannot start until you push it to GitHub, GitLab, or Bitbucket.

## Supabase persistence setup

When you are ready to persist real data:

1. Set `DEMO_MODE=false`
2. Add `SUPABASE_URL`
3. Add `SUPABASE_SERVICE_ROLE_KEY`
4. Apply all migrations:
   [20260504160000_init_aegis.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504160000_init_aegis.sql)
   [20260504190000_phase3_persistence.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504190000_phase3_persistence.sql)
   [20260504203000_phase4_crm.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504203000_phase4_crm.sql)
   [20260504220000_phase5_automations.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504220000_phase5_automations.sql)
   [20260505225000_phase6_background_jobs.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260505225000_phase6_background_jobs.sql)
5. Run [supabase/seed.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/seed.sql)
6. Restart the app

If Supabase is not configured while `DEMO_MODE=false`, the server returns a clear configuration error instead of falling back silently.

## Safe deploy checklist

Use this order whenever voice, SMS, CRM sync, or background jobs change:

1. Apply any new Supabase migrations before or alongside code deployment.
2. Deploy Vercel and Render from matching `main` commits when phone logic changes.
3. Run the production verification script:

```bash
npm run verify:production
```

4. Confirm these endpoints are healthy:
   - `POST /api/twilio/voice-script`
   - `POST /api/twilio/sms`
   - `GET /api/health/ops`
   - `GET https://aegis-voice-bridge.onrender.com/health`
5. Compare `releaseVersion` across Vercel and Render. If they differ, redeploy the older side before testing customer calls.

## Live integrations

After Supabase is configured, connect the live services:

1. Add `OPENAI_API_KEY`
2. Add `BASE44_APP_ID` and `BASE44_API_KEY` if you want Forklift Pro Solutions to use live ForkliftPro stock, customer, sales, maintenance, and parts data
3. Optionally set `BASE44_WORKSPACE_ID` to the Forklift Pro Solutions workspace ID if you only want Base44 data attached to that workspace
4. Optionally set `FORKLIFT_WEBSITE_BASE_URL` so AEGIS can include full clickable truck links in phone-generated purchase summary drafts
5. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`
6. Point `NEXT_PUBLIC_APP_URL` to the public app URL for Twilio callbacks

## Important implementation notes

- Secrets never touch the browser. OpenAI and Twilio are called only from server routes.
- The Supabase service role key is used only in server-only modules and is never exposed to the browser.
- Approval is required before SMS, email, outbound calls, website updates, posting online, or bulk CRM edits.
- Demo mode returns safe placeholder responses so the UI can be exercised without spending API credits.
- When `DEMO_MODE=false`, workspaces, conversations, messages, approvals, audit logs, tool calls, integration settings, CRM follow-ups, automations, scheduled jobs, and run logs are persisted in Supabase.
- The scheduled job runner is exposed through the server route `POST /api/jobs/run`, which processes due jobs, logs each run, retries failures, and keeps approval gates in place for risky actions.

## Key files

- App shell: [src/components/aegis-app.tsx](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/components/aegis-app.tsx)
- Agent orchestration: [src/lib/agent.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/agent.ts)
- Repository switcher: [src/lib/repository.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/repository.ts)
- Automation templates and scheduling helpers: [src/lib/automation-templates.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/automation-templates.ts)
- Demo state layer: [src/lib/demo-store.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/demo-store.ts)
- Supabase admin client: [src/lib/supabase-server.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/supabase-server.ts)
- OpenAI service wrapper: [src/lib/services/openai.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/services/openai.ts)
- Twilio service wrapper: [src/lib/services/twilio.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/services/twilio.ts)
- Database schema: [supabase/migrations/20260504160000_init_aegis.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504160000_init_aegis.sql) and [supabase/migrations/20260504190000_phase3_persistence.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504190000_phase3_persistence.sql)
