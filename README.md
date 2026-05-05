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
   - `OPENAI_REALTIME_VOICE=marin`
   - `OPENAI_REALTIME_TURN_MODE=semantic_vad`
   - `OPENAI_REALTIME_TURN_EAGERNESS=low`
   - `TWILIO_MEDIA_STREAM_URL=wss://your-public-domain/media-stream`
   - `TWILIO_MEDIA_STREAM_PORT=3001`
2. Make sure your public tunnel routes `/media-stream` to local port `3001`
3. Start both the Next app and the realtime bridge:

```bash
npm run dev:voice
```

If the realtime bridge is disabled, the app falls back to the clip-based OpenAI TTS phone route.

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
5. Run [supabase/seed.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/seed.sql)
6. Restart the app

If Supabase is not configured while `DEMO_MODE=false`, the server returns a clear configuration error instead of falling back silently.

## Live integrations

After Supabase is configured, connect the live services:

1. Add `OPENAI_API_KEY`
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`
3. Point `NEXT_PUBLIC_APP_URL` to the public app URL for Twilio callbacks

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
