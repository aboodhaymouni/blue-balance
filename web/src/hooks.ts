import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { errorText, getEgressSnapshot, isDown, subscribeEgress, type EgressSnapshot } from './api'

export interface PollState<T> {
  data: T | null
  error: string | null
  /** The last attempt failed because the backend is unreachable. */
  down: boolean
  /** True until the first attempt finishes. */
  loading: boolean
  /** Fetch now (queued if a request is already in flight). */
  refresh: () => Promise<void>
}

/**
 * Calls `fetcher` now and every `intervalMs` (skipped while the tab is hidden).
 * Never overlaps requests; a refresh asked for during a request runs right after it.
 * Keeps the last good data when a later poll fails.
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [down, setDown] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetcherRef = useRef(fetcher)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  const refresh = useCallback(async function run(): Promise<void> {
    if (inFlight.current) {
      queued.current = true
      return
    }
    inFlight.current = true
    try {
      const next = await fetcherRef.current()
      if (alive.current) {
        setData(next)
        setError(null)
        setDown(false)
      }
    } catch (err) {
      if (alive.current) {
        setError(errorText(err))
        setDown(isDown(err))
      }
    } finally {
      inFlight.current = false
      if (alive.current) setLoading(false)
      if (queued.current && alive.current) {
        queued.current = false
        void run()
      }
    }
  }, [])

  useEffect(() => {
    alive.current = true
    if (!enabled) return
    void refresh()
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh()
    }, intervalMs)
    return () => {
      alive.current = false
      window.clearInterval(id)
    }
  }, [refresh, intervalMs, enabled])

  return { data, error, down, loading, refresh }
}

function subscribeOnline(fn: () => void): () => void {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

/** navigator.onLine, live. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/** Live egress log (requests by host) from api.ts. */
export function useEgress(): EgressSnapshot {
  return useSyncExternalStore(subscribeEgress, getEgressSnapshot, getEgressSnapshot)
}
