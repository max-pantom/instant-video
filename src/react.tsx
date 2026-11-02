import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react'
import './element'
import type { InstantVideoElement } from './element'
import type { InstantSource } from './types'

export interface InstantVideoProps {
  source: InstantSource | null | undefined
  /** Play the hover preview. */
  active?: boolean
  /** Get ready without playing (hover/focus intent). */
  warm?: boolean
  mode?: 'preview' | 'player'
  controls?: boolean
  onModeChange?: (mode: 'preview' | 'player') => void
  startAt?: number
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  poster?: string
  title?: string
  download?: boolean
  children?: ReactNode
  /** Hit-area element for prediction; default is the nearest [data-iv-target] ancestor, else the parent. */
  target?: Element | null
}

/** Thin React wrapper over <instant-video>. Absolutely positioned over its parent. */
export function InstantVideo({
  source, active = false, warm = false, mode = 'preview', controls = false, onModeChange,
  startAt = 0, autoPlay = false, muted = true, loop = false, poster = '', title = '', download = false,
  target = null, children,
}: InstantVideoProps) {
  const ref = useRef<InstantVideoElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.target = target
    el.source = source ?? null
    el.mode = mode
    el.controls = controls
    el.startAt = startAt
    el.autoPlay = autoPlay
    el.muted = muted
    el.loop = loop
    el.poster = poster
    el.title = title
    el.download = download
  }, [source, target, mode, controls, startAt, autoPlay, muted, loop, poster, title, download])
  useLayoutEffect(() => {
    const el = ref.current!
    el.warmed = warm
    el.active = active
  }, [active, warm])
  useLayoutEffect(() => {
    const el = ref.current!
    if (!onModeChange) return
    const listener = (event: Event) => onModeChange((event as CustomEvent<{ mode: 'preview' | 'player' }>).detail.mode)
    el.addEventListener('modechange', listener)
    return () => el.removeEventListener('modechange', listener)
  }, [onModeChange])
  return createElement('instant-video', { ref }, children)
}
