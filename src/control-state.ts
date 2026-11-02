export interface ControlState {
  playing: boolean
  muted: boolean
  volume: number
  rate: number
  loop: boolean
  controlsVisible: boolean
  captions: boolean
  quality: 'auto' | 360 | 720 | 1080
}

export type ControlAction =
  | { type: 'play' | 'pause' | 'show-controls' | 'hide-controls' | 'toggle-captions' | 'toggle-loop' | 'toggle-muted' }
  | { type: 'volume'; value: number }
  | { type: 'rate'; value: number }
  | { type: 'quality'; value: ControlState['quality'] }

export const initialControlState = (patch: Partial<ControlState> = {}): ControlState => ({
  playing: false, muted: true, volume: 1, rate: 1, loop: false,
  controlsVisible: true, captions: false, quality: 'auto', ...patch,
})

export function reduceControlState(state: ControlState, action: ControlAction): ControlState {
  switch (action.type) {
    case 'play': return { ...state, playing: true }
    case 'pause': return { ...state, playing: false, controlsVisible: true }
    case 'show-controls': return { ...state, controlsVisible: true }
    case 'hide-controls': return state.playing ? { ...state, controlsVisible: false } : state
    case 'toggle-muted': return { ...state, muted: !state.muted }
    case 'volume': {
      const volume = Math.min(1, Math.max(0, action.value))
      return { ...state, volume, muted: volume === 0 }
    }
    case 'rate': return { ...state, rate: Math.min(2, Math.max(0.5, action.value)) }
    case 'quality': return { ...state, quality: action.value }
    case 'toggle-loop': return { ...state, loop: !state.loop }
    case 'toggle-captions': return { ...state, captions: !state.captions }
  }
}
