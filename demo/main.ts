import { configure, InstantVideoElement, quality, type InstantSource } from '../dist/index.js'

configure({ predict: true, prefetch: true })

// Page chrome first: none of it may wait on the demo clip, which can be slow or missing.
const status = document.querySelector<HTMLElement>('#status')
const announce = (message: string) => {
  if (!status) return
  status.textContent = ''
  requestAnimationFrame(() => { status.textContent = message })
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  // data-copy-from keeps long copy text (the agent prompt) in one place: the element it points at
  const from = button.dataset.copyFrom ? document.querySelector<HTMLElement>(button.dataset.copyFrom) : null
  if (from) button.dataset.copy = from.textContent?.trim() ?? ''
  let reset = 0
  button.addEventListener('click', async () => {
    clearTimeout(reset)
    button.classList.add('copied')
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? '')
      announce('Copied to clipboard')
      reset = window.setTimeout(() => button.classList.remove('copied'), 1400)
    } catch {
      button.classList.remove('copied')
      // no clipboard (plain http, denied permission): select the text so a manual copy is one keystroke away
      const text = from ?? button.querySelector('code')
      if (text) getSelection()?.selectAllChildren(text)
      announce('Could not copy. The text is selected, so press Ctrl+C or ⌘C.')
    }
  })
}

if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js')
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      reveal.unobserve(entry.target)
    }
  }, { rootMargin: '0px 0px -40px 0px' })
  document.querySelectorAll<HTMLElement>('.item').forEach((item, i) => {
    item.style.setProperty('--d', `${(i % 4) * 50}ms`)
    reveal.observe(item)
  })
}

void setupStage()

async function setupStage() {
  const stage = document.querySelector<HTMLElement>('#stage')
  const video = document.querySelector('#video')
  const poster = document.querySelector<HTMLImageElement>('#poster')
  const fill = document.querySelector<HTMLElement>('#fill')
  const hint = document.querySelector<HTMLElement>('#hint')
  if (!stage || !(video instanceof InstantVideoElement) || !poster || !fill || !hint) return

  // L'Arroseur arrosé (Lumière, 1895): public domain, the first prank on film
  let clip: InstantSource
  try {
    const res = await fetch('assets/gardener.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    clip = (await res.json()) as InstantSource
  } catch {
    hint.textContent = 'The demo clip could not load.'
    stage.classList.add('is-still')
    return
  }
  poster.src = clip.poster?.jpg ?? poster.src
  video.source = clip

  const label = 'Open the demo clip in the player'
  stage.classList.add('is-ready')
  stage.tabIndex = 0
  stage.setAttribute('role', 'button')
  stage.setAttribute('aria-label', label)

  // Reduced motion, Save-Data and 2g get the still; a deliberate click or Enter still opens the player.
  const stills = quality() === 'off'
  if (stills) {
    hint.textContent = 'Previews are off (reduced motion or data saver). Click or press Enter to watch.'
    stage.classList.add('is-still')
  } else {
    video.warmed = true
  }

  let opened = false
  let lastX = 0
  let resume = 0
  let frame = 0
  let restoring = false

  const preview = (on: boolean) => {
    if (opened || stills) return
    stage.classList.toggle('is-active', on)
    video.active = on
  }

  const open = () => {
    if (opened) return
    opened = true
    clearTimeout(resume)
    cancelAnimationFrame(frame)
    frame = 0
    stage.classList.remove('is-scrubbing')
    stage.classList.add('is-active', 'is-open')
    // the player has its own name and controls; a button role around them would hide them from assistive tech
    stage.removeAttribute('role')
    stage.removeAttribute('aria-label')
    stage.tabIndex = -1
    video.mode = 'player'
    video.active = true
    video.controls = true
    video.focus({ preventScroll: true })
  }

  const close = (returnFocus: boolean) => {
    clearTimeout(resume)
    cancelAnimationFrame(frame)
    frame = 0
    const wasOpen = opened
    opened = false
    video.mode = 'preview'
    video.controls = false
    video.active = false
    stage.classList.remove('is-active', 'is-open', 'is-scrubbing')
    fill.style.transform = 'scaleX(0)'
    if (!wasOpen) return
    stage.setAttribute('role', 'button')
    stage.setAttribute('aria-label', label)
    stage.tabIndex = 0
    // never leave focus inside the now-hidden player
    if (returnFocus || stage.contains(document.activeElement)) {
      restoring = true
      stage.focus({ preventScroll: true })
      restoring = false
    }
  }

  // Mouse and pen: hover plays, sideways movement scrubs, rest resumes. Touch has no hover, so it skips all of this.
  stage.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return
    lastX = event.clientX
    preview(true)
  })
  stage.addEventListener('pointermove', (event) => {
    if (opened || stills || event.pointerType === 'touch' || Math.abs(event.clientX - lastX) < 2) return
    lastX = event.clientX
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0
      if (opened) return
      const rect = stage.getBoundingClientRect()
      const progress = Math.max(0, Math.min(1, (lastX - rect.left) / rect.width))
      stage.classList.add('is-scrubbing')
      fill.style.transform = `scaleX(${progress})`
      video.scrub(progress)
    })
    clearTimeout(resume)
    resume = window.setTimeout(() => {
      if (opened) return
      stage.classList.remove('is-scrubbing')
      video.resume()
    }, 350)
  }, { passive: true })
  stage.addEventListener('pointerleave', (event) => {
    // on touch, pointerleave fires after every lift, which would close the player under the finger
    if (event.pointerType !== 'touch') close(false)
  })

  stage.addEventListener('click', open)
  stage.addEventListener('keydown', (event) => {
    if (event.target === stage && !opened && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      open()
    } else if (event.key === 'Escape' && opened) {
      // the player's menus stop Escape themselves, so this only fires once no menu is open
      event.preventDefault()
      close(true)
    }
  })
  // keyboard focus previews like hover does; mouse focus is already covered by pointerenter
  stage.addEventListener('focus', () => { if (!restoring && stage.matches(':focus-visible')) preview(true) })
  stage.addEventListener('blur', () => { if (!opened && !stage.matches(':hover')) preview(false) })
  stage.addEventListener('focusout', (event) => {
    if (opened && !stage.contains(event.relatedTarget as Node | null) && !stage.matches(':hover')) close(false)
  })
  // touch has no pointerleave to end a session: tapping elsewhere or scrolling it away does
  document.addEventListener('pointerdown', (event) => {
    if (opened && event.pointerType === 'touch' && !stage.contains(event.target as Node)) close(false)
  }, { passive: true })
  new IntersectionObserver(([entry]) => {
    if (opened && entry && !entry.isIntersecting) close(false)
  }).observe(stage)
}
