// Primitive8 outline icons, 20px grid, 1.5 stroke — copied verbatim from icon-factory/packages/icons/svg/outline/20/<slug>.svg.
const paths = {
  // play.svg
  play: '<path d="M7.25 6.076A1 1 0 0 1 8.788 5.233L14.931 9.157A1 1 0 0 1 14.931 10.843L8.788 14.767A1 1 0 0 1 7.25 13.924Z" fill="none" stroke="currentColor" />',
  // pause.svg
  pause: '<line x1="7.25" y1="4.75" x2="7.25" y2="15.25" fill="none" stroke="currentColor" /><line x1="12.75" y1="4.75" x2="12.75" y2="15.25" fill="none" stroke="currentColor" />',
  // volume.svg
  volume: '<path d="M3.25 8.75A0.5 0.5 0 0 1 3.75 8.25L5.543 8.25A0.5 0.5 0 0 0 5.896 8.104L8.896 5.104A0.5 0.5 0 0 1 9.75 5.457L9.75 14.543A0.5 0.5 0 0 1 8.896 14.896L5.896 11.896A0.5 0.5 0 0 0 5.543 11.75L3.75 11.75A0.5 0.5 0 0 1 3.25 11.25Z" fill="none" stroke="currentColor" /><path d="M13.5 6.5C15.5 8.5 15.5 11.5 13.5 13.5" fill="none" stroke="currentColor" />',
  // volume-off.svg
  muted: '<path d="M2.75 8.75A0.5 0.5 0 0 1 3.25 8.25L5.043 8.25A0.5 0.5 0 0 0 5.396 8.104L8.396 5.104A0.5 0.5 0 0 1 9.25 5.457L9.25 14.543A0.5 0.5 0 0 1 8.396 14.896L5.396 11.896A0.5 0.5 0 0 0 5.043 11.75L3.25 11.75A0.5 0.5 0 0 1 2.75 11.25Z" fill="none" stroke="currentColor" /><path d="M13.25 7.5L17.25 11.5M17.25 7.5L13.25 11.5" fill="none" stroke="currentColor" />',
  // repeat.svg
  loop: '<path d="M3.25 8.5L3.25 7.25C3.25 5.583 4.083 4.75 5.75 4.75L16.75 4.75M16.75 11.5L16.75 12.75C16.75 14.417 15.917 15.25 14.25 15.25L3.25 15.25" fill="none" stroke="currentColor" /><path d="M14.25 2.25L16.29 4.29Q16.75 4.75 16.29 5.21L14.25 7.25M5.75 12.75L3.71 14.79Q3.25 15.25 3.71 15.71L5.75 17.75" fill="none" stroke="currentColor" />',
  // picture-in-picture.svg
  pip: '<rect x="2.75" y="4.75" width="14.5" height="10.5" rx="2.5" fill="none" stroke="currentColor" /><rect x="9.75" y="8.75" width="4.5" height="3.5" rx="1" fill="none" stroke="currentColor" />',
  // maximize.svg
  fullscreen: '<path d="M3.25 7.75L3.25 3.9Q3.25 3.25 3.9 3.25L7.75 3.25M12.25 3.25L16.1 3.25Q16.75 3.25 16.75 3.9L16.75 7.75M16.75 12.25L16.75 16.1Q16.75 16.75 16.1 16.75L12.25 16.75M7.75 16.75L3.9 16.75Q3.25 16.75 3.25 16.1L3.25 12.25" fill="none" stroke="currentColor" />',
  // minimize.svg
  exitFullscreen: '<path d="M3.25 7.25L6.6 7.25Q7.25 7.25 7.25 6.6L7.25 3.25M12.75 3.25L12.75 6.6Q12.75 7.25 13.4 7.25L16.75 7.25M16.75 12.75L13.4 12.75Q12.75 12.75 12.75 13.4L12.75 16.75M7.25 16.75L7.25 13.4Q7.25 12.75 6.6 12.75L3.25 12.75" fill="none" stroke="currentColor" />',
  // download.svg
  download: '<path d="M3.25 14.25L3.25 15.25C3.25 16.583 3.917 17.25 5.25 17.25L14.75 17.25C16.083 17.25 16.75 16.583 16.75 15.25L16.75 14.25" fill="none" stroke="currentColor" /><path d="M9.75 2.75L9.75 11.75M6.25 8.25L9.29 11.29Q9.75 11.75 10.21 11.29L13.25 8.25" fill="none" stroke="currentColor" />',
  // closed-captions.svg
  cc: '<rect x="2.25" y="4.25" width="15.5" height="11.5" rx="3.5" fill="none" stroke="currentColor" /><path d="M8.591 11.591C7.712 12.47 6.288 12.47 5.409 11.591C4.53 10.712 4.53 9.288 5.409 8.409C6.288 7.53 7.712 7.53 8.591 8.409M14.591 11.591C13.712 12.47 12.288 12.47 11.409 11.591C10.53 10.712 10.53 9.288 11.409 8.409C12.288 7.53 13.712 7.53 14.591 8.409" fill="none" stroke="currentColor" />',
  // check.svg
  check: '<path d="M4 10L7.54 13.54Q8 14 8.46 13.54L16 6" fill="none" stroke="currentColor" />',
} as const

export type PlayerIcon = keyof typeof paths
export const icon = (name: PlayerIcon, size = name === 'check' ? 16 : 20) => `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`
