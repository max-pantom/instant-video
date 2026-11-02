// In-memory store for clip heads (a few tens of KB each) plus a small low-priority prefetch queue.
const MAX = 120
const heads = new Map<string, Promise<ArrayBuffer>>()

async function get(url: string, priority: 'high' | 'low'): Promise<ArrayBuffer> {
  const r = await fetch(url, { priority, credentials: 'omit' } as RequestInit)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.arrayBuffer()
}

/** Head bytes, from memory when prefetched. LRU-capped. */
export function head(url: string, priority: 'high' | 'low' = 'high'): Promise<ArrayBuffer> {
  let p = heads.get(url)
  if (p) {
    heads.delete(url)
    heads.set(url, p)
    return p
  }
  p = get(url, priority)
  p.catch(() => heads.get(url) === p && heads.delete(url))
  heads.set(url, p)
  if (heads.size > MAX) heads.delete(heads.keys().next().value!)
  return p
}

/** Tails are bigger and only needed once; the HTTP cache (immutable) covers re-use. */
export const tail = (url: string) => get(url, 'high')

export const has = (url: string) => heads.has(url)

let running = 0
const queue: string[] = []
const LIMIT = 3

export function prefetchHead(url: string) {
  if (heads.has(url) || queue.includes(url)) return
  queue.push(url)
  drain()
}

const idle: (cb: () => void) => void = (cb) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 1500 }) : void setTimeout(cb, 120)

function drain() {
  while (running < LIMIT && queue.length) {
    const url = queue.shift()!
    if (heads.has(url)) continue
    running++
    idle(() => {
      head(url, 'low')
        .catch(() => {})
        .finally(() => {
          running--
          drain()
        })
    })
  }
}
