import { config } from './config'

/** Anything the pool can release. */
export interface Poolable {
  active: boolean
  cool(): void
}

const warm = new Set<Poolable>()

/** Mark as most recently used; evict the oldest idle ones beyond the pool size. */
export function touch(p: Poolable) {
  warm.delete(p)
  warm.add(p)
  for (const old of warm) {
    if (warm.size <= config.poolSize) break
    if (old === p || old.active) continue
    warm.delete(old)
    old.cool()
  }
}

export const drop = (p: Poolable) => void warm.delete(p)
