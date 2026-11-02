// Outline icons from https://factory.primitive8.cc/icons (16px grid, 1.5 stroke).
const paths = {
  play: '<path d="M5.75 5.56a1 1 0 0 1 1.53-.85l3.88 2.44a1 1 0 0 1 0 1.7l-3.88 2.44a1 1 0 0 1-1.53-.85Z"/>',
  pause: '<path d="M5.25 3.25v9.5M10.75 3.25v9.5"/>',
  volume: '<path d="M2.75 6.25h2.5l3-2.5v8.5l-3-2.5h-2.5Z"/><path d="M10.5 6a3 3 0 0 1 0 4M12 4.5a5 5 0 0 1 0 7"/>',
  muted: '<path d="M2.75 6.25h2.5l3-2.5v8.5l-3-2.5h-2.5Z"/><path d="m10.5 6 3 4M13.5 6l-3 4"/>',
  loop: '<path d="M12.75 6.25V4.5a1.5 1.5 0 0 0-1.5-1.5h-6.5A1.5 1.5 0 0 0 3.25 4.5v.25M10.75 4.25l2 2 2-2M3.25 9.75v1.75A1.5 1.5 0 0 0 4.75 13h6.5a1.5 1.5 0 0 0 1.5-1.5v-.25M5.25 11.75l-2-2-2 2"/>',
  pip: '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><rect x="7.75" y="7.25" width="4.5" height="3.5" rx=".75"/>',
  fullscreen: '<path d="M2.75 6V3.4q0-.65.65-.65H6M10 2.75h2.6q.65 0 .65.65V6M13.25 10v2.6q0 .65-.65.65H10M6 13.25H3.4q-.65 0-.65-.65V10"/>',
  download: '<path d="M2.75 11.75v.5q0 2 2 2h6.5q2 0 2-2v-.5M7.75 1.75v7.5M5 6.5l2.75 2.75L10.5 6.5"/>',
  cc: '<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2"/><path d="M7 6.25H5.75q-1.5 0-1.5 1.75t1.5 1.75H7M12 6.25h-1.25q-1.5 0-1.5 1.75t1.5 1.75H12"/>',
} as const

export type PlayerIcon = keyof typeof paths
export const icon = (name: PlayerIcon) => `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
