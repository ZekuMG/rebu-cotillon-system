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

## Conversation Operations Line

Use the **conversation operations line** when a workflow has three simultaneous needs: choose an item, work on it, and make or approve a decision. It is the signature pattern for assisted WhatsApp work and may be reused for other operator queues with the same decision flow.

### Anatomy

- Left rail — **attention queue**: search, compact filters, item identity, recency, ownership, and pending/handoff status.
- Center stage — **active work**: conversation history, operational context, and the primary composer.
- Right rail — **human decision**: escalation reason, editable suggestion, approval action, and supporting context.
- Keep the three areas on one continuous horizontal line so the operator can scan from attention to action to decision without changing screens.
- Default desktop proportions are approximately `0.8fr / 1.55fr / 0.9fr`, with practical minimums of `238px / 330px / 265px`.

### Visual Signature

- Mark the currently active decision zone with a thin Rebu brand rail, not a decorative card or large colored block.
- Carry status through small semantic marks and short labels: green for available/automatic, amber for pending human attention, red for failure or blocked action.
- The active conversation uses a quiet surface shift and border emphasis; avoid saturated row backgrounds.
- Phone numbers, times, queue counts, and other operational data use tabular numerals.

### Contact Identity Marker

- In compact conversation lists, show a Rebu member match as a 14px circular mark overlapping the avatar's lower-right corner; never add another text line or permanent member badge.
- Use a green check only for one unambiguous phone match, an amber alert when several members share the number, and no mark when there is no match.
- Keep a 2px border matching the WhatsApp panel so the mark stays legible over both real profile photos and initial avatars.
- Expose the complete meaning through an accessible label and tooltip; detailed member information remains in the Contact panel.
- On large contact avatars, scale the mark to 18px while preserving the same position and semantics.

### WhatsApp Dark Surface

- Treat WhatsApp as one continuous dark workspace. Its queue header, contact list, conversation header, and optional context rail must share the same panel tone instead of inheriting the app's generic blue headers.
- Use the established module palette:
  - Conversation canvas: `#0b141a`.
  - Queue, headers, and panel surfaces: `#111b21`.
  - Hover and selected conversation: `#18252c`.
  - Raised messages, composer, and menus: `#202c33`.
  - Inset controls: `#2a3942`.
  - Outgoing messages: `#005c4b`.
  - WhatsApp action/connection accent: `#00a884`.
  - Quiet separators: `rgba(134, 150, 160, 0.18)`.
- Use only subtle lightness shifts between adjacent surfaces. Do not tint the full module bright green and do not allow blue-night strips behind contact names.
- Row-internal headers remain transparent so the conversation row owns their background. The queue header and active-contact header both use `#111b21`.
- Human or bot responder labels may use a restrained translucent green treatment; avoid saturated blue identity badges inside the WhatsApp module.
- Keep Rebu fuchsia limited to the thin active/decision rail. Amber and red remain reserved for attention and failure states.
- Use one module type stack based on `Segoe UI`, with compact tabular metadata. Message size may be personalized without changing the surrounding hierarchy.
- Depth remains border-and-surface based; shadows are reserved for floating menus. Continue the 4px spacing base.

### Interaction And State

- Global automation state belongs in the screen header; per-conversation ownership belongs beside the active conversation.
- Separate **bot mode** from **human ownership**. Turning automation off globally must not visually imply that a person has taken every conversation.
- A suggested reply remains editable before approval. In observation-only mode, show the suggestion but disable its approval action and explain why.
- Manual replies remain available when permissions allow, even when automated suggestions are disabled.
- Every rail must cover loading, empty, error, disabled, selected, and stale/disconnected states without collapsing the overall layout.
- Refresh queue data in the background without moving the operator away from the selected conversation.

### Permission Rules

- Viewing the queue, replying, and managing global mode are separate capabilities.
- Hide controls that are outside the role's scope when they would create noise; disable and explain controls when seeing the unavailable action helps the operator understand the workflow.
- Never expose infrastructure credentials in this surface. Requests use the authenticated Rebu session through the trusted application bridge.

### Responsive Rule

- Preserve the three-part relationship for desktop counter use.
- As width contracts, reduce fixed rail widths before changing the information architecture.
- On genuinely narrow screens, convert the rails into an explicit queue → conversation → decision sequence; do not squeeze all three into unreadable columns.

## Depth And Spacing

- Dense tool spacing: 4px micro gaps, 8px control gaps, 10px horizontal control padding.
- Prefer borders and surface shifts over heavy shadows.
- Dark mode uses borders and lighter elevated surfaces; light mode uses cold paper gradients and subtle borders.

## Token Architecture

- Use `--rebu-canvas`, `--rebu-surface-1`, `--rebu-surface-2`, and `--rebu-surface-3` for page, panel, raised, and toolbar/dropdown surfaces.
- Use `--rebu-control` and `--rebu-control-inset` for inputs, selects, range controls, and editable numeric fields.
- Use `--rebu-text-primary`, `--rebu-text-secondary`, `--rebu-text-tertiary`, and `--rebu-text-muted` for readable hierarchy instead of ad hoc slate grays.
- Use `--rebu-border-soft`, `--rebu-border`, and `--rebu-border-strong` for separation, controls, and focus/elevated edges.
- Use `--rebu-brand`, `--rebu-success`, `--rebu-warning`, `--rebu-danger`, and `--rebu-info` with their matching `*-bg` and `*-border` tokens for semantic UI.
- Tickets and print previews remain paper-light in dark mode because they represent printed output, not app chrome.
