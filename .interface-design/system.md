# Interface Design System

## Direction

Rebu is a point-of-sale and cash-control tool. The interface should feel like an operative counter: compact, readable at a glance, and grounded in daily cash work rather than a generic dashboard.

## Color Palettes

### Light

- Canvas: cold paper tones, `#f1f5f9`, `#edf4fb`, `#f8fbff`.
- Ink: blue-night text, `#102033`, `#334155`, `#526277`.
- Brand accent: Rebu fuchsia, `#d946ef`.
- Cash/open state: green, `#22c55e`, `#15803d`, `#dcfce7`.
- Warning/cutoff: amber, `#f59e0b`, `#b45309`, `#fffbeb`.
- Error/closed state: red/rose, `#ef4444`, `#b91c1c`, `#fee2e2`.

### Dark

- Canvas: blue-night surfaces, `#07111f`, `#0b1728`, `#0d1b2e`.
- Elevated surface: `#0f1e33`, `#102139`.
- Ink: `#f8fafc`, `#dbeafe`, `#b8c6da`.
- Brand accent: fuchsia remains the identity line, slightly muted.
- Cash/open state: translucent green, `rgba(16, 185, 129, 0.16)`, text `#86efac`.
- Warning/cutoff: translucent amber, text `#fbbf24`.
- Error/closed state: translucent red, text `#fca5a5`.

## Header Pattern

- Main header is an operative control bar, not a collection of badges.
- Keep the left side for location: section title, cloud status, and current time.
- Keep the right side for immediate operational actions: register state, cutoff time, refresh actions.
- Avoid showing the current user in the header unless it becomes actionable; user identity belongs in the sidebar/session area.
- Use one consistent control height, currently `34px`, with compact radius `5px`.
- Use a thin Rebu identity rail on the header instead of extra decorative blocks.

## Depth And Spacing

- Dense tool spacing: 4px micro gaps, 8px control gaps, 10px horizontal control padding.
- Prefer borders and surface shifts over heavy shadows.
- Dark mode uses borders and lighter elevated surfaces; light mode uses cold paper gradients and subtle borders.
