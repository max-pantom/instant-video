import { describe, expect, it } from 'vitest'
import { initialControlState, reduceControlState } from '../src/control-state'

describe('player control state', () => {
  it('only hides controls while playing', () => {
    let state = reduceControlState(initialControlState(), { type: 'hide-controls' })
    expect(state.controlsVisible).toBe(true)
    state = reduceControlState(reduceControlState(state, { type: 'play' }), { type: 'hide-controls' })
    expect(state.controlsVisible).toBe(false)
    expect(reduceControlState(state, { type: 'pause' })).toMatchObject({ playing: false, controlsVisible: true })
  })

  it('clamps volume and playback speed', () => {
    let state = reduceControlState(initialControlState({ muted: false }), { type: 'volume', value: -1 })
    expect(state).toMatchObject({ volume: 0, muted: true })
    state = reduceControlState(state, { type: 'rate', value: 4 })
    expect(state.rate).toBe(2)
  })

  it('tracks quality, captions, loop, and mute choices', () => {
    let state = reduceControlState(initialControlState(), { type: 'quality', value: 1080 })
    state = reduceControlState(state, { type: 'toggle-captions' })
    state = reduceControlState(state, { type: 'toggle-loop' })
    state = reduceControlState(state, { type: 'toggle-muted' })
    expect(state).toMatchObject({ quality: 1080, captions: true, loop: true, muted: false })
  })
})
