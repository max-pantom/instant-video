import type { Config } from './types'

export const config: Config = {
  predict: true,
  prefetch: 'viewport',
  poolSize: 4,
  lookaheadMs: 180,
  size: 'auto',
  codec: 'auto',
  mse: true,
}

export function configure(patch: Partial<Config>) {
  Object.assign(config, patch)
}
