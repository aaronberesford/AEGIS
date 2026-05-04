# AEGIS

Mobile-first AI operations command app built with Next.js. The current MVP is wired for a local demo first, while keeping all OpenAI and Twilio calls on the server and enforcing approval gates for risky actions.

## What is included

- Multi-tenant workspace model with seeded demo companies:
  - Forklift Pro Solutions
  - Yorkshire Hamper Co.
- Mobile-first dark UI modeled on the provided AEGIS mockup
- Chat-driven AEGIS assistant with workspace-aware context
- Voice record flow with server-side transcription hook and server-side TTS hook
- Approval queue for SMS, calls, email, web, and bulk actions
- Twilio-ready SMS and outbound call routes
- CRM, tasks, automations, settings, and audit log scaffolding
- Supabase/Postgres SQL migration and seed files
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

## Live integrations

When you are ready to connect real services:

1. Set `DEMO_MODE=false`
2. Add `OPENAI_API_KEY`
3. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`
4. Point `NEXT_PUBLIC_APP_URL` to the public app URL for Twilio callbacks
5. Apply the SQL in [supabase/migrations/20260504160000_init_aegis.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504160000_init_aegis.sql)
6. Run [supabase/seed.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/seed.sql)

## Important implementation notes

- Secrets never touch the browser. OpenAI and Twilio are called only from server routes.
- Approval is required before SMS, email, outbound calls, website updates, posting online, or bulk CRM edits.
- Demo mode returns safe placeholder responses so the UI can be exercised without spending API credits.
- The current data layer uses an in-memory demo store for local operation. The SQL schema is ready for swapping to a real Postgres/Supabase repository next.

## Key files

- App shell: [src/components/aegis-app.tsx](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/components/aegis-app.tsx)
- Agent orchestration: [src/lib/agent.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/agent.ts)
- Demo state layer: [src/lib/demo-store.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/demo-store.ts)
- OpenAI service wrapper: [src/lib/services/openai.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/services/openai.ts)
- Twilio service wrapper: [src/lib/services/twilio.ts](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/src/lib/services/twilio.ts)
- Database schema: [supabase/migrations/20260504160000_init_aegis.sql](C:/Users/aaron/Desktop/A.E.G.I.S/aegis-app/supabase/migrations/20260504160000_init_aegis.sql)
