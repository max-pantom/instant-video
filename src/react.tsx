import { createElement, useLayoutEffect, useRef } from 'react'
import './element'
import type { InstantVideoElement } from './element'
import type { InstantSource } from './types'

export interface InstantVideoProps {
  source: InstantSource | null | undefined
  /** Play (muted loop). */
  active: boolean
  /** Get ready without playing (hover/focus intent). */
  warm?: boolean
  /** `play` loops normally; `scrub` maps horizontal pointer position to the clip timeline. */
  mode?: 'play' | 'scrub'
  /** Hit-area element for prediction; default is the nearest [data-iv-target] ancestor, else the parent. */
  target?: Element | null
}

/** Thin React wrapper over <instant-video>. Absolutely positioned over its parent. */
export function InstantVideo({ source, active, warm = false, mode = 'play', target = null }: InstantVideoProps) {
  const ref = useRef<InstantVideoElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.target = target
    el.source = source ?? null
    el.mode = mode
  }, [source, target, mode])
  useLayoutEffect(() => {
    const el = ref.current!
    el.warmed = warm
    el.active = active
  }, [active, warm])
  return createElement('instant-video', { ref })
}
