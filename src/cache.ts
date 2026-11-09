import { prefetchLimit } from './env'

// In-memory store for small clip heads. Low-priority work is bounded; active playback promotes queued work.
const MAX = 120
type Priority = 'high' | 'low'
type Task = { key: string; url: string; end?: number; priority: Priority; started: boolean; promise: Promise<ArrayBuffer>; resolve: (b: ArrayBuffer) => void; reject: (e: unknown) => void }
const heads = new Map<string, Task>()
const queue: Task[] = []
let running = 0

const keyOf = (url: string, end?: number) => `${url}#0-${end ?? ''}`

const matchesRange = (response: Response, start: number, end?: number) => {
  const value = response.headers.get('content-range')
  if (!value) return true
  const match = /^bytes (\d+)-(\d+)\/(?:\d+|\*)$/i.exec(value)
  if (!match || Number(match[1]) !== start) return false
  return end === undefined || Number(match[2]) === end
}

// Some CDNs cache a 206 response by URL without varying on Range. Give a mismatched cached
// response a range-specific URL so its head and tail cannot poison one another.
const rangeRetryUrl = (url: string, start: number, end?: number) => {
  const hashAt = url.indexOf('#')
  const base = hashAt < 0 ? url : url.slice(0, hashAt)
  const hash = hashAt < 0 ? '' : url.slice(hashAt)
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}__iv_range=${encodeURIComponent(`${start}-${end ?? ''}`)}${hash}`
}

async function get(url: string, priority: Priority, start?: number, end?: number): Promise<ArrayBuffer> {
  const ranged = start !== undefined || end !== undefined
  const first = start ?? 0
  const headers = ranged ? { Range: `bytes=${first}-${end ?? ''}` } : undefined
  const request = (target: string) => fetch(target, { priority, credentials: 'omit', headers } as RequestInit)
  let response = await request(url)
  if (ranged && response.status === 206 && !matchesRange(response, first, end)) {
    response = await request(rangeRetryUrl(url, first, end))
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  if (ranged && response.status === 206 && !matchesRange(response, first, end)) {
    throw new Error(`wrong byte range for ${url}`)
  }
  const data = await response.arrayBuffer()
  // A static host may ignore Range and return 200. Preserve correctness without a second compatibility path.
  if (ranged && response.status === 200) return data.slice(start ?? 0, end === undefined ? undefined : end + 1)
  return data
}

function run(task: Task, speculative: boolean) {
  if (task.started) return
  task.started = true
  if (speculative) running++
  get(task.url, task.priority, 0, task.end).then(task.resolve, task.reject).finally(() => {
    if (speculative) {
      running--
      drain()
    }
  })
}

function drain() {
  const limit = prefetchLimit()
  while (running < limit && queue.length) {
    const task = queue.shift()!
    if (!task.started && heads.get(task.key) === task) run(task, true)
  }
}

/** Head bytes, from memory when prefetched. `end` is the inclusive Range end for single-file manifests. */
export function head(url: string, end?: number, priority: Priority = 'high'): Promise<ArrayBuffer> {
  const key = keyOf(url, end)
  let task = heads.get(key)
  if (task) {
    heads.delete(key)
    heads.set(key, task)
    if (priority === 'high' && !task.started) {
      task.priority = 'high'
      const at = queue.indexOf(task)
      if (at >= 0) queue.splice(at, 1)
      run(task, false)
    }
    return task.promise
  }
  let resolve!: (b: ArrayBuffer) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no })
  task = { key, url, end, priority, started: false, promise, resolve, reject }
  promise.catch(() => heads.get(key) === task && heads.delete(key))
  heads.set(key, task)
  if (heads.size > MAX) {
    const oldest = heads.keys().next().value!
    const evicted = heads.get(oldest)
    heads.delete(oldest)
    const at = evicted ? queue.indexOf(evicted) : -1
    if (at >= 0) queue.splice(at, 1)
  }
  if (priority === 'high') run(task, false)
  else { queue.push(task); drain() }
  return promise
}

/** Remaining fragments. `start` is the first byte after the cached head in a single-file fMP4. */
export const tail = (url: string, start?: number) => get(url, 'high', start)

export const has = (url: string, end?: number) => heads.has(keyOf(url, end))

export function prefetchHead(url: string, end?: number) {
  if (prefetchLimit() < 1) return
  head(url, end, 'low').catch(() => {})
}
