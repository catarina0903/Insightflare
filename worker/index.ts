import { FeedbackIngestWorkflow } from './workflows/feedback_ingest'

export interface Env {
  AI: Ai
  AI_MODEL: keyof AiModels
  feedback_dashboard_db: D1Database
  FEEDBACK_WORKFLOW: Workflow
}

type IngestPayload = {
  title: string
  detail: string
  source?: string
  channel?: string
}

type SentimentResult = {
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown'
  confidence: number | null
  summary: string
}

const mockSourceOptions = ['Support', 'Docs', 'GitHub', 'Community', 'Email']

const normalizeAiText = (result: unknown) => {
  if (!result) return null
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    const maybeResponse = (result as { response?: string }).response
    if (typeof maybeResponse === 'string') return maybeResponse
    return JSON.stringify(result)
  }
  return null
}

const generateMockEntry = async (env: Env): Promise<IngestPayload> => {
  try {
    const nonce = crypto.randomUUID().slice(0, 8)
    const result = await env.AI.run(env.AI_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'Generate one realistic SaaS feedback entry. Reply with JSON only: {"title": "...", "detail": "...", "source": "...", "channel": "..."}. Keep detail under 140 chars.',
        },
        {
          role: 'user',
          content: `Focus on product feedback about reliability, UX, or pricing. Unique seed: ${nonce}`,
        },
      ],
    })

    const text = normalizeAiText(result)
    if (!text) throw new Error('Empty AI response')
    const parsed = JSON.parse(text) as IngestPayload
    return {
      title: parsed.title ?? 'Feedback submitted',
      detail: parsed.detail ?? 'Customer reported an issue with the product flow.',
      source: parsed.source ?? 'Simulated Ingest',
      channel:
        parsed.channel ??
        mockSourceOptions[Math.floor(Math.random() * mockSourceOptions.length)],
    }
  } catch {
    return {
      title: 'Feedback submitted',
      detail: 'Customer reported an issue with the product flow.',
      source: 'Simulated Ingest',
      channel:
        mockSourceOptions[Math.floor(Math.random() * mockSourceOptions.length)],
    }
  }
}

const analyzeSentiment = async (
  env: Env,
  text: string,
): Promise<SentimentResult> => {
  try {
    const result = await env.AI.run(env.AI_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You are a sentiment analyzer. Reply with JSON only: {"sentiment": "positive|neutral|negative|mixed", "confidence": 0-1, "summary": "short reason"}.',
        },
        { role: 'user', content: text },
      ],
    })

    const raw = normalizeAiText(result)
    if (!raw) throw new Error('Empty AI response')
    const parsed = JSON.parse(raw) as Partial<SentimentResult>
    return {
      sentiment: parsed.sentiment ?? 'unknown',
      confidence:
        typeof parsed.confidence === 'number' ? parsed.confidence : null,
      summary: parsed.summary ?? 'No summary returned.',
    }
  } catch {
    return {
      sentiment: 'unknown',
      confidence: null,
      summary: 'Unable to analyze sentiment.',
    }
  }
}

export { FeedbackIngestWorkflow }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/feedback') {
      const { results } = await env.feedback_dashboard_db
        .prepare(
          'SELECT id, title, detail, source, channel, urgent, created_at FROM feedback ORDER BY created_at DESC',
        )
        .all()

      return Response.json({ items: results })
    }

    if (url.pathname === '/api/updates') {
      const { results } = await env.feedback_dashboard_db
        .prepare('SELECT MAX(created_at) as lastUpdated FROM feedback')
        .all()
      return Response.json({ lastUpdated: results?.[0]?.lastUpdated ?? null })
    }

    if (url.pathname === '/api/sentiment') {
      const id = url.searchParams.get('id')
      if (!id) {
        return Response.json({ error: 'id is required' }, { status: 400 })
      }

      const row = await env.feedback_dashboard_db
        .prepare(
          'SELECT title, detail, source, channel, created_at FROM feedback WHERE id = ?',
        )
        .bind(id)
        .first()

      if (!row) {
        return Response.json({ error: 'Not found' }, { status: 404 })
      }

      const text = `${row.title}\n${row.detail}`
      const sentiment = await analyzeSentiment(env, text)
      return Response.json({ sentiment, entry: row })
    }

    if (url.pathname === '/api/ingest' && request.method === 'POST') {
      const payload = (await request.json()) as IngestPayload
      if (!payload?.title || !payload?.detail) {
        return Response.json(
          { error: 'title and detail are required' },
          { status: 400 },
        )
      }

      await env.FEEDBACK_WORKFLOW.create({ params: payload })
      return Response.json({ status: 'queued' })
    }

    if (url.pathname === '/api/ingest/mock' && request.method === 'POST') {
      const entry = await generateMockEntry(env)
      await env.FEEDBACK_WORKFLOW.create({ params: entry })
      return Response.json({ status: 'queued', entry })
    }

    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Env>
