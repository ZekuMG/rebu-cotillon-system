# Rebu Codex Context

This repo contains the Rebu point-of-sale desktop app built with React, Vite, Electron, and Supabase.

Before changing or scanning the dashboard, read:

- `.agents/context/dashboard.md`
- `.interface-design/system.md`

Dashboard work usually crosses three layers:

- `src/App.jsx`: cloud/offline loading, global state, navigation handlers, and modals.
- `src/views/DashboardView.jsx`: dashboard orchestration, layout order, permissions, and widget rendering.
- `src/hooks/useDashboardData.js`: derived metrics, filtered sales/expenses, rankings, payment totals, and alerts.

Keep dashboard changes aligned with the current operative-counter design direction in `.interface-design/system.md`.

## Release versioning

- Do NOT automatically change the version on every edit or batch. Only change the version in `package.json` and `package-lock.json` when the user explicitly requests a version change.
