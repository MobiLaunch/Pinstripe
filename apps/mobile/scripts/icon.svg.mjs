/**
 * The app icon, drawn as SVG: pinstripe blue, a white play mark, and the
 * iOS 6 gloss across the top. `node scripts/make-icons.mjs` renders it.
 * Parts: 'full' (iOS/web: background, mark and gloss), 'background' and
 * 'foreground' (Android's adaptive layers), 'mark' (splash), 'mono'.
 */
export function iconSvg(part = 'full', size = 1024) {
  const bg = `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6fb8ff"/>
        <stop offset="0.55" stop-color="#1f74dd"/>
        <stop offset="1" stop-color="#0a3f98"/>
      </linearGradient>
      <pattern id="stripes" width="1024" height="16" patternUnits="userSpaceOnUse">
        <rect width="1024" height="8" fill="rgba(255,255,255,0.07)"/>
      </pattern>
    </defs>
    <rect width="1024" height="1024" fill="url(#sky)"/>
    <rect width="1024" height="1024" fill="url(#stripes)"/>`;
  // Scale the mark down for Android's safe zone.
  const markScale = part === 'foreground' || part === 'mono' ? 0.62 : part === 'mark' ? 1 : 0.86;
  const mark = `
    <defs>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#d7e4f3"/>
      </linearGradient>
      <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#062a66" flood-opacity="0.55"/>
      </filter>
    </defs>
    <g transform="translate(512 512) scale(${markScale}) translate(-512 -512)">
      <path filter="url(#drop)" fill="${part === 'mono' ? '#ffffff' : 'url(#face)'}"
        d="M392 262 Q352 238 352 285 L352 739 Q352 786 392 762 L767 538 Q807 512 767 486 Z"
        stroke="${part === 'mono' ? 'none' : '#ffffff'}" stroke-width="10" stroke-linejoin="round"/>
    </g>`;
  const gloss = `
    <defs>
      <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    <ellipse cx="512" cy="-190" rx="930" ry="690" fill="url(#gloss)"/>`;
  const body = {
    full: bg + mark + gloss,
    background: bg,
    foreground: mark,
    mark,
    mono: mark,
  }[part];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
}
