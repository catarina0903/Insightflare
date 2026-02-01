import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'

type FeedbackPayload = {
  title: string
  detail: string
  source?: string
  channel?: string
}

type WorkflowEnv = {
  AI: Ai
  AI_MODEL: keyof AiModels
  feedback_dashboard_db: D1Database
}

const urgentKeywordRegex =
  /(urgent|outage|down|error|500|timeout|incident|p0|p1|sev|critical)/i

const classifyUrgentFallback = (payload: FeedbackPayload) => {
  const text = `${payload.title} ${payload.detail}`
  return urgentKeywordRegex.test(text)
}

const parseUrgentFromAI = (result: unknown) => {
  if (!result) return null
  if (typeof result === 'string') return result
  if (typeof result === 'object') return JSON.stringify(result)
  return null
}

export class FeedbackIngestWorkflow extends WorkflowEntrypoint<
  WorkflowEnv,
  FeedbackPayload
> {
  async run(event: WorkflowEvent<FeedbackPayload>, step: WorkflowStep) {
    const payload = event.payload

    const urgent = await step.do('classify urgent', async () => {
      if (!payload?.title || !payload?.detail) {
        return 0
      }

      try {
        const result = await this.env.AI.run(this.env.AI_MODEL, {
          messages: [
            {
              role: 'system',
              content:
                'You classify feedback as urgent or not. Reply with JSON only: {"urgent": true|false}.',
            },
            {
              role: 'user',
              content: `Title: ${payload.title}\nDetail: ${payload.detail}`,
            },
          ],
        })

        const text = parseUrgentFromAI(result)
        if (!text) return classifyUrgentFallback(payload) ? 1 : 0
        const parsed = JSON.parse(text)
        return parsed.urgent ? 1 : 0
      } catch {
        return classifyUrgentFallback(payload) ? 1 : 0
      }
    })

    return await step.do('store in d1', async () => {
      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      await this.env.feedback_dashboard_db
        .prepare(
          'INSERT INTO feedback (id, title, detail, source, channel, urgent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          payload.title,
          payload.detail,
          payload.source ?? null,
          payload.channel ?? null,
          urgent,
          createdAt,
        )
        .run()

      return { id, urgent, createdAt }
    })
  }
}
