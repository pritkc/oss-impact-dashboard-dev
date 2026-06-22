# UI/UX Principles — OSS Impact Dashboard

> **For AI agents (Codex, Cascade, etc.):** Follow these principles when modifying any UI code in this repository. Do not deviate without explicit user approval.

## Stack

- **Vanilla JS + Vite** — no React, no Tailwind, no CSS framework
- **Chart.js** for all charts
- **Tabulator** for data tables
- **Custom CSS** in `web/src/styles.css` using CSS custom properties (design tokens)
- **Inter** (sans) + **JetBrains Mono** (numbers) loaded from Google Fonts

## Design Tokens

All colors, spacing, radii, and typography are defined as CSS custom properties in `:root` (light) and `[data-theme="dark"]` (dark). **Never hardcode hex values** in components or chart configs — always reference tokens.

### Token naming convention

```
--bg          page background
--panel       card/panel surface
--panel-2     secondary surface (subtle backgrounds, hover states)
--border      default 1px border
--border-2    stronger border (inputs, focus rings)
--text        primary text
--text-2      secondary text (labels, descriptions)
--text-3      tertiary text (timestamps, placeholders)
--primary     accent color (links, primary buttons, active nav)
--primary-hover  darker accent for hover
--primary-bg  light accent background (active nav, subtle highlights)
--success     green — available, ok, positive
--success-bg  light green background
--danger      red — error, unavailable, negative
--danger-bg   light red background
--warning     amber — caution, development
--warning-bg  light amber background
--radius      8px — cards, panels
--radius-sm   6px — buttons, inputs, pills
--shadow      subtle elevation (0 1px 3px rgba(0,0,0,0.04))
--font-sans   'Inter', system-ui, sans-serif
--font-mono   'JetBrains Mono', monospace
```

## Layout Rules

1. **Max content width:** `1200px` centered. Never wider.
2. **Topbar:** `48px` height, sticky, `border-bottom: 1px solid var(--border)`, translucent with `backdrop-filter: blur(8px)`.
3. **Page padding:** `20px` on desktop, `14px` on mobile.
4. **Card padding:** `16px`. Never more than `20px`.
5. **Grid gaps:** `12px` between cards. Never more than `16px`.
6. **Section spacing:** `16px` margin-bottom between sections. Never more than `20px`.

## Typography Rules

1. **Body text:** 14px, `line-height: 1.5`, `color: var(--text)`.
2. **Card titles (h2):** 14px, `font-weight: 600`, `color: var(--text)`.
3. **Stat numbers:** 24px, `font-weight: 600`, `font-variant-numeric: tabular-nums`, `font-family: var(--font-mono)`.
4. **Stat labels:** 12px, `color: var(--text-2)`, `font-weight: 500`.
5. **Stat details (small):** 11px, `color: var(--text-3)`.
6. **Table headers:** 11px, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `color: var(--text-2)`.
7. **Table cells:** 13px, `color: var(--text)`.
8. **Nav links:** 13px, `font-weight: 500`.
9. **Brand:** 14px, `font-weight: 700`.
10. **Never use `font-weight: 800` or `900`.** Maximum is 700 for brand only.

## Color Usage Rules

1. **Neutrals for 95% of the UI.** Backgrounds, borders, text — all neutral slate.
2. **Primary accent** only for: primary buttons, active nav state, links, focus rings.
3. **Status colors** only for: status badges, status text, banners. Never for decoration.
4. **Chart colors:** Use the defined `--chart-1` through `--chart-5` tokens. Charts should use muted, harmonious colors — not saturated primaries.
5. **Never use gradients** in the dashboard UI. Solid colors only.

## Component Rules

### Stat cards
- `background: var(--panel)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`
- No box-shadow on individual stat cards. They sit in a grid with shared border.
- Number uses mono font with tabular-nums.
- Min-height: `76px`. Padding: `14px 16px`.

### Panels
- `background: var(--panel)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`
- `box-shadow: var(--shadow)` — subtle, never heavy.
- Padding: `16px`.

### Buttons
- Min-height: `34px`. Padding: `6px 14px`.
- `border-radius: var(--radius-sm)`.
- `font-weight: 600`, `font-size: 13px`.
- Primary: `background: var(--primary)`, `color: #fff`, `border: 1px solid var(--primary)`.
- Secondary: `background: var(--panel)`, `border: 1px solid var(--border-2)`, `color: var(--text)`.

### Inputs / Selects
- Min-height: `34px`. Padding: `6px 10px`.
- `border-radius: var(--radius-sm)`.
- `border: 1px solid var(--border-2)`.
- Focus: `border-color: var(--primary)`, `box-shadow: 0 0 0 2px var(--primary-bg)`.

### Badges / Pills
- Height: `20px`. Padding: `1px 8px`.
- `border-radius: 999px`.
- `font-size: 11px`, `font-weight: 600`.
- Use `*-bg` and `*` color pairs (e.g., `background: var(--success-bg)`, `color: var(--success)`).

### Tables (Tabulator)
- Header: `background: var(--panel-2)`, uppercase, 11px, `color: var(--text-2)`.
- Rows: `border-bottom: 1px solid var(--border)`, min-height `40px`.
- Hover: `background: var(--panel-2)`.
- Cell padding: `8px 12px`.
- Numbers: `font-variant-numeric: tabular-nums`.

## Chart Rules

1. **Set Chart.js defaults** at module level: font family, font size (12px), color (`var(--text-3)`), border color (`var(--border)`).
2. **Line charts:** `borderWidth: 2`, `pointRadius: 0`, `pointHoverRadius: 4`, `tension: 0.3`.
3. **Bar charts:** `borderRadius: 4`, `borderSkipped: false`, no bar borders.
4. **Grid:** Only horizontal grid lines (y-axis), `color: var(--border)`, `drawBorder: false`.
5. **Axis labels:** 11px, `color: var(--text-3)`. No axis title text (redundant with chart title).
6. **Legend:** Position bottom, 12px, `color: var(--text-2)`, `boxWidth: 12`, `boxHeight: 12`.
7. **Title:** 13px, `font-weight: 600`, `color: var(--text)`.
8. **Subtitle:** 11px, `color: var(--text-3)`.
9. **Tooltips:** `backgroundColor: var(--text)`, `titleColor: var(--panel)`, `bodyColor: var(--panel)`, `cornerRadius: var(--radius-sm)`, `padding: 8px 10px`, `boxPadding: 4`.
10. **Doughnut charts:** `cutout: '65%'`, no legend by default (show values in chart summary text).

## Dark Mode Rules

1. Toggle via `data-theme` attribute on `<html>`.
2. Persist in `localStorage` as `oss-dashboard-theme`.
3. Respect `prefers-color-scheme: dark` on first visit.
4. All tokens swap in `[data-theme="dark"]` block.
5. Chart.js colors must update when theme changes (re-read CSS variables).
6. Toggle button in topbar: icon-only, `24px` size, no label text.

## Responsive Breakpoints

- **`<= 900px:** Grids collapse to 1 column. Stats go 2-column. Topbar nav wraps.
- **`<= 560px:** Stats go 1-column. All grids 1-column. Shell padding reduces to 14px.

## Print Rules

- Hide: topbar, nav, buttons, actions, theme toggle.
- Remove all shadows and borders.
- White background only.
- Show full URLs after links.
- `break-inside: avoid` on all sections and tables.

## Accessibility

- Focus visible: `outline: 2px solid var(--primary)`, `outline-offset: 1px`.
- All interactive elements must have visible focus state.
- Charts must have `aria-label` set to chart title.
- Color contrast: text on panel must be ≥ 4.5:1 (WCAG AA).
- Never rely on color alone for status — include text label.

## What NOT to Do

- Do not add `font-weight: 800` or `900` anywhere.
- Do not add heavy box-shadows (`0 18px 45px...`).
- Do not add gradients to backgrounds.
- Do not hardcode hex colors in HTML, CSS components, or JS.
- Do not add more than 5 colors to any single chart.
- Do not add decorative icons or illustrations.
- Do not add animations longer than 150ms.
- Do not increase padding beyond the values specified above.
- Do not add a sidebar — the topbar nav is sufficient for 4 pages.
