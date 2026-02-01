import { useEffect, useMemo, useState } from 'react'
import './App.css'

type FeedbackEntry = {
  id: string
  title: string
  detail: string
  source: string | null
  channel: string | null
  urgent: number
  created_at: string
}

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function App() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [ingestStatus, setIngestStatus] = useState<'idle' | 'sending' | 'done'>(
    'idle',
  )
  const [toast, setToast] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeEntry, setActiveEntry] = useState<FeedbackEntry | null>(null)
  const [sentiment, setSentiment] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error'
    data?: {
      sentiment: string
      confidence: number | null
      summary: string
    }
  }>({ status: 'idle' })

  useEffect(() => {
    let isMounted = true
    setStatus('loading')
    fetch('/api/feedback')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load feedback')
        }
        return response.json() as Promise<{ items: FeedbackEntry[] }>
      })
      .then((data) => {
        if (!isMounted) return
        setEntries(data.items ?? [])
        setStatus('ready')
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetch('/api/updates')
        .then((response) => response.json() as Promise<{ lastUpdated: string }>)
        .then((data) => {
          if (!data?.lastUpdated || data.lastUpdated === lastUpdated) return
          setLastUpdated(data.lastUpdated)
          setToast('New feedback received')
          window.setTimeout(() => setToast(null), 2500)
          return fetch('/api/feedback')
            .then(
              (response) =>
                response.json() as Promise<{ items: FeedbackEntry[] }>,
            )
            .then((payload) => setEntries(payload.items ?? []))
        })
        .catch(() => undefined)
    }, 3000)

    return () => window.clearInterval(interval)
  }, [lastUpdated])

  const handleMockIngest = () => {
    setIngestStatus('sending')
    fetch('/api/ingest/mock', { method: 'POST' })
      .then(() => {
        setIngestStatus('done')
        window.setTimeout(() => setIngestStatus('idle'), 1500)
      })
      .catch(() => setIngestStatus('idle'))
  }

  useEffect(() => {
    if (!activeEntry) return
    setSentiment({ status: 'loading' })
    fetch(`/api/sentiment?id=${activeEntry.id}`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load sentiment')
        return response.json() as Promise<{
          sentiment: {
            sentiment: string
            confidence: number | null
            summary: string
          }
        }>
      })
      .then((data) => {
        setSentiment({ status: 'ready', data: data.sentiment })
      })
      .catch(() => setSentiment({ status: 'error' }))
  }, [activeEntry])

  useEffect(() => {
    if (!activeEntry) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveEntry(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeEntry])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return entries
    return entries.filter((entry) => {
      const haystack = `${entry.title} ${entry.detail}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [entries, searchQuery])

  const urgentEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.urgent === 1),
    [filteredEntries],
  )

  const generalEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.urgent === 0),
    [filteredEntries],
  )

  return (
    <div className='app'>
      {toast ? <div className='toast'>{toast}</div> : null}
      <header className='topbar'>
        <div className='brand'>
            <img src='/cloudflare-logo.png' alt='' className='brand-logo' />
          <span className='brand-title'>Insightflare</span>
        </div>
        <button className='user-button' type='button' aria-label='Open user menu'>
          <span className='user-avatar'>CF</span>
        </button>
      </header>

      <section className='hero'>
        <div className='hero-copy'>
          <p className='eyebrow'>Customer signals</p>
          <h1>Turn feedback into signal.</h1>
          <p className='subhead'>
            Built on Cloudflare, it captures what users are saying, highlights
            what’s urgent, and keeps your team aligned in one fast, reliable
            view.
          </p>
          <button
            className='search-action hero-action'
            type='button'
            onClick={handleMockIngest}
          >
            {ingestStatus === 'sending'
              ? 'Simulating…'
              : ingestStatus === 'done'
                ? 'Queued!'
                : 'Simulate feedback ingest'}
          </button>
        </div>

        <div className='search'>
          <span className='search-icon' aria-hidden='true'>
            <svg viewBox='0 0 24 24' role='img' aria-hidden='true'>
              <path
                d='M11 3a8 8 0 1 0 5.293 14.293l3.707 3.707 1.414-1.414-3.707-3.707A8 8 0 0 0 11 3zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z'
                fill='currentColor'
              />
            </svg>
          </span>
          <input
            className='search-input'
            type='search'
            placeholder='Search feedback, accounts, or keywords'
            aria-label='Search feedback'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button className='search-action' type='button'>
            Search
          </button>
        </div>
      </section>

      <section className='feedback-grid'>
        <article className='feedback-card urgent'>
          <header className='card-header'>
            <div>
              <p className='card-title'>Urgent</p>
              <p className='card-meta'>Escalations that need same-day action</p>
            </div>
            <span className='pill urgent'>High priority</span>
          </header>
          <ul className='entries'>
            {status === 'loading' ? (
              <li className='entry'>
                <p className='entry-title'>Loading urgent feedback…</p>
                <p className='entry-detail'>Pulling the latest signals.</p>
              </li>
            ) : urgentEntries.length === 0 ? (
              <li className='entry'>
                <p className='entry-title'>No urgent feedback yet</p>
                <p className='entry-detail'>Everything looks calm right now.</p>
              </li>
            ) : (
              urgentEntries.map((entry) => (
                <li
                  key={entry.id}
                  className='entry'
                  onClick={() => setActiveEntry(entry)}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setActiveEntry(entry)
                    }
                  }}
                >
                  <div>
                    <p className='entry-title'>{entry.title}</p>
                    <p className='entry-detail'>{entry.detail}</p>
                  </div>
                  <div className='entry-meta'>
                    <span>{entry.source ?? entry.channel ?? 'Unknown source'}</span>
                    <span>{formatTimestamp(entry.created_at)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className='feedback-card general'>
          <header className='card-header'>
            <div>
              <p className='card-title'>General</p>
              <p className='card-meta'>Themes and requests to batch and plan</p>
            </div>
            <span className='pill general'>Review this week</span>
          </header>
          <ul className='entries'>
            {status === 'loading' ? (
              <li className='entry'>
                <p className='entry-title'>Loading general feedback…</p>
                <p className='entry-detail'>Syncing your backlog.</p>
              </li>
            ) : status === 'error' ? (
              <li className='entry'>
                <p className='entry-title'>Unable to load feedback</p>
                <p className='entry-detail'>Check the Worker API connection.</p>
              </li>
            ) : generalEntries.length === 0 ? (
              <li className='entry'>
                <p className='entry-title'>No general feedback yet</p>
                <p className='entry-detail'>Keep collecting signals.</p>
              </li>
            ) : (
              generalEntries.map((entry) => (
                <li
                  key={entry.id}
                  className='entry'
                  onClick={() => setActiveEntry(entry)}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setActiveEntry(entry)
                    }
                  }}
                >
                  <div>
                    <p className='entry-title'>{entry.title}</p>
                    <p className='entry-detail'>{entry.detail}</p>
                  </div>
                  <div className='entry-meta'>
                    <span>{entry.source ?? entry.channel ?? 'Unknown source'}</span>
                    <span>{formatTimestamp(entry.created_at)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      {activeEntry ? (
        <div
          className='modal-overlay'
          role='presentation'
          onClick={() => setActiveEntry(null)}
        >
          <div
            className='modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='modal-title'
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className='modal-close'
              type='button'
              onClick={() => setActiveEntry(null)}
              aria-label='Close'
            >
              ×
            </button>
            <div className='modal-header'>
              <p className='eyebrow'>Feedback detail</p>
              <h2 id='modal-title'>{activeEntry.title}</h2>
              <p className='modal-meta'>
                {activeEntry.source ?? activeEntry.channel ?? 'Unknown source'} ·{' '}
                {formatTimestamp(activeEntry.created_at)}
              </p>
            </div>
            <div className='modal-body'>
              <p className='modal-detail'>{activeEntry.detail}</p>
              <div className='modal-section'>
                <h3>Sentiment</h3>
                {sentiment.status === 'loading' ? (
                  <p className='modal-loading'>Analyzing sentiment…</p>
                ) : sentiment.status === 'error' ? (
                  <p className='modal-loading'>Sentiment unavailable.</p>
                ) : sentiment.status === 'ready' && sentiment.data ? (
                  <div className='sentiment'>
                    <span className='sentiment-pill'>
                      {sentiment.data.sentiment}
                    </span>
                    <p className='sentiment-summary'>{sentiment.data.summary}</p>
                    {sentiment.data.confidence !== null ? (
                      <p className='sentiment-confidence'>
                        Confidence: {Math.round(sentiment.data.confidence * 100)}%
                      </p>
                    ) : null}
                    <div className='sentiment-powered'>
                      <span>powered by Cloudflare Workers AI</span>
                      <img
                        src='/workers.svg'
                        alt='Cloudflare Workers AI'
                        className='sentiment-icon'
                      />
                    </div>
                  </div>
                ) : (
                  <p className='modal-loading'>Awaiting sentiment…</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
