# Insightflare

Insightflare is a feedback intelligence dashboard built on Cloudflare. It aggregates incoming feedback, classifies urgency with Workers AI, stores results in D1, and presents a clean UI for triage and trend spotting.

## Architecture overview

- **Cloudflare Workers**: Serves the API and hosts the frontend build.
- **D1**: Primary storage for feedback entries.
- **Workflows**: Durable pipeline to ingest, classify, and store feedback.
- **Workers AI**: Urgency classification on ingest + sentiment analysis in the modal.
- **Vite + React**: Frontend UI (search, triage lists, modal).

## Data flow

1. **Ingest**: `POST /api/ingest` or `POST /api/ingest/mock`
2. **Workflow**: `FeedbackIngestWorkflow` runs:
   - classify urgency (Workers AI, fallback heuristic)
   - insert into D1
3. **UI refresh**:
   - `GET /api/updates` checks for new data
   - `GET /api/feedback` fetches the latest entries
4. **Modal sentiment**:
   - `GET /api/sentiment?id=...` runs Workers AI sentiment analysis

## API endpoints

- `GET /api/feedback` → list feedback entries
- `GET /api/updates` → latest `created_at` timestamp
- `POST /api/ingest` → ingest a real payload
- `POST /api/ingest/mock` → generate a mock entry with Workers AI
- `GET /api/sentiment?id=...` → sentiment analysis for a given entry

## Local development

```bash
npm install
npm run dev
```

In another terminal, run the Worker:

```bash
npx wrangler dev --remote
```

Note: `--remote` is recommended so Workers AI runs against your account.

## Database setup

Apply migrations locally:

```bash
npx wrangler d1 migrations apply feedback-dashboard-db --local
```

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply feedback-dashboard-db --remote
```

## Deploy

```bash
npm run build
npx wrangler deploy
```

## Key files

- `worker/index.ts` — API routes + workflow triggers
- `worker/workflows/feedback_ingest.ts` — ingestion workflow
- `migrations/*.sql` — D1 schema + seed data
- `src/App.tsx` — UI
- `wrangler.jsonc` — bindings (D1, AI, Workflows)

## Notes

- Workers AI binding is configured in `wrangler.jsonc` under `"ai"`.
- The AI model is set via `AI_MODEL` in `wrangler.jsonc`.
- The search box filters by `title` or `detail` on the client.
