import type { Palette, Skin } from './skin'

// Every skin works on a light background too. A skin may carry its own light palette;
// the rest are derived: body text goes near-black, bands go near-white, and each colour
// is deepened until it reads on white.

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`

// `amount` of the way from `hex` to black.
export const deepen = (hex: string, amount: number): string =>
  toHex(channels(hex).map(value => value * (1 - amount)))

export function toLight(palette: Palette): Palette {
  const deep = (hex: string) => deepen(hex, 0.45)

  return {
    read: deep(palette.read),
    write: deep(palette.write),
    run: deep(palette.run),
    search: deep(palette.search),
    web: deep(palette.web),
    mcp: deep(palette.mcp),
    other: deep(palette.other),
    user: deep(palette.user),
    fg: '#1f1f1f',
    muted: '#6b6b6b',
    surface: '#ffffff',
    zebra: '#f2f2f2',
    ok: deepen(palette.ok, 0.5),
    err: deepen(palette.err, 0.25),
    warn: deepen(palette.warn, 0.5),
  }
}

export const forTheme = (skin: Skin, isLight: boolean): Skin =>
  isLight ? { ...skin, palette: skin.light ?? toLight(skin.palette) } : skin

// Claude Code's theme names say light or dark in them: `light`, `light-daltonized`, ...
export const isLightTheme = (value: unknown): boolean => typeof value === 'string' && value.includes('light')
