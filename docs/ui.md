# Furu UI conventions

How the app shell, screens and components are organised, and the rules that keep
new work consistent. Read this before adding a page or a control.

## Shell

Furu is a touch-first phone app that also runs on the desktop. Every screen is
rendered inside one shell:

| Part | Component | Notes |
|------|-----------|-------|
| Header | `src/lib/components/ui/AppHeader.svelte` | Back button on child routes, logo on tabs, version on the right |
| Firmware banner | `src/lib/components/ui/DfuBanner.svelte` | Rendered in the header so a transfer stays visible everywhere |
| Content | route page | Scrolls; the shell never scrolls as a whole |
| Tab bar | `src/lib/components/ui/NavBar.svelte` | Only on the four root tabs |
| Overlays | `ConfirmDialog`, `Toaster` | Mounted once in `src/routes/(app)/+layout.svelte` |

## Navigation

Four root tabs, and nothing else:

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/home` | The active watch: status, stats, primary actions |
| Devices | `/devices` | All paired watches, pairing at `/devices/add` |
| Integrations | `/integrations` | External services and what they add to the watch |
| Settings | `/settings` | App preferences, filters, permissions, profiles |

Everything else is a child of a tab and shows the back button:

```text
/device/:id                     device detail (home + watch setup + firmware + history)
/device/:id/settings            per-device preferences
/settings/device-profiles       profiles and name detection
/settings/notification-filters  per-app blocklist
/settings/permissions           permission status
/settings/diagnostics           index
/settings/diagnostics/logs      connection log
/settings/diagnostics/ble       manual BLE tools
/settings/about                 version and links
/integrations/:provider         configuration form
```

**Diagnostics is deliberately secondary.** The connection log and manual
Bluetooth tools live under Settings → Diagnostics, not in the tab bar. They are
maintainer tools; the app's value is not in showing them. Old URLs `/log`,
`/debug` and `/add` redirect so nothing 404s.

## Theme

Catppuccin, with **Mocha as the default**. The mechanism matters:

1. `src/app.html` sets `data-theme="catppuccin"` and `data-mode="dark"` on
   `<html>`, and resolves a stored preference before first paint.
2. `src/app.css` declares `@custom-variant dark (&:where([data-mode="dark"], …))`
   so Tailwind's `dark:` variant follows `data-mode` rather than the OS.
3. The same file overrides Skeleton's approximate Catppuccin ramp with the
   official Mocha and Latte palettes, and puts the page background one step below
   the card surface so elevation reads.

**The pairing trap.** Skeleton declares its `x-y` color pairings (for example
`--color-surface-700-300`) with CSS `light-dark()`. Vite's Lightning CSS pass —
which Tailwind v4 always runs — lowers `light-dark()` into
`prefers-color-scheme` media queries. Those ignore `data-mode`, so every paired
utility kept its dark value in Latte, and a light-mode user got dark buttons and
dark muted text on a light page. `src/app.css` therefore **redeclares every
pairing explicitly** for `[data-theme="catppuccin"]` (lighter half) and
`[data-theme="catppuccin"][data-mode="dark"]` (darker half). Do not remove that
block, and do not reintroduce `light-dark()` for app-level tokens.

**Every accent needs a full 50–950 ramp.** Skeleton's `preset-*` utilities read
the extremes: `preset-tonal-warning` paints `--color-warning-950` as the
background and `--color-warning-950-50` as the text. Defining only `500`, `600`
and `700` (with `950` still set to the bright accent) produced a solid yellow or
red block with invisible text — the "unexplained coloured boxes" in Watch setup
and the firmware list. Keep 50 lightest and 950 darkest in **both** modes, and
give each step a `-contrast-` token naming readable text on it.

Rules:

- Use **paired tokens** (`bg-surface-50-950`, `text-surface-700-300`,
  `border-surface-200-800`). They resolve correctly in both modes because of the
  explicit declarations above.
- Do **not** use arbitrary color syntax such as
  `text-[color:var(--color-surface-700-300)]`; Skeleton already generates the
  utility and the arbitrary form is unreadable.
- No hard-coded hex in components. Accents come from `primary`/`secondary`/
  `tertiary`/`success`/`warning`/`error`.
- `preset-*` utilities animate `background-color` over 150 ms, so a scripted
  color read immediately after switching `data-mode` can still show the old
  value. Wait for the transition before judging a theme switch.
- Theme choice is `appSettings.themeMode` (`dark` | `light` | `system`), changed
  in Settings → Appearance.

## Components

`src/lib/components/ui/` holds the shared primitives. Prefer them over copying
class strings; before this existed the same card markup appeared fourteen times
and the same muted-text utility seventy-six times.

| Component | Use |
|-----------|-----|
| `Card` | Any grouped surface. Takes `title`, `description`, `actions` |
| `SettingRow` | Label + hint + control. `stacked` for full-width inputs |
| `ListRow` | Icon, title, subtitle, trailing. Link, button or static |
| `StatTile` | One metric with a value, unit and optional hint |
| `StatusPill` | Connection or configuration state |
| `EmptyState` | Explains what to do when a list is empty |
| `PageHeading` | The page's `h1`, description and actions |
| `ConfirmDialog` + `confirm()` | Every confirmation. Never `window.confirm` |
| `Toaster` + `toastSuccess/Error/Info` | Feedback after saves and failures |

Device-specific cards live in `src/lib/components/device/`.

### Svelte 5 rules

- Runes only: `$state`, `$derived`, `$props`, snippets.
- **Do not write state inside `$effect`.** Derive from the source instead. When a
  form needs local edits seeded from a store, key the edits by an id so the value
  is `$derived` (see the integration form and the device nickname field).
- Effects are for external systems only, for example scrolling a log container.
- Validate components with the Svelte MCP `svelte-autofixer` before committing.

## Copy and tone

- Name the action, not the mechanism: "Repair connection", not "Refresh GATT cache".
- Say what happens next, and say when something is not implemented. The
  integration pages state plainly that no data flows yet; the Kongle watch setup
  states that firmware support is pending.
- Never imply success the app cannot verify. Firmware updates report "activation
  requested", not "installed".
- Placeholders are `—`, never `0`, so missing data is not mistaken for a reading.
- **Heart rate is never a headline stat.** The PineTime sensor is unreliable in
  practice, so it only appears when a reading is actually present, and never as a
  permanent empty tile. Revisit for PineTime Pro.

## Data presentation

- Home is the *active watch*: one hero card, then its recent history. It does not
  list every device — that is the Devices tab's job.
- The device nickname is Home's page heading. Do not add a page title above it;
  a card titled the same as the page heading reads as a duplicate.
- Every actionable control is a real `btn` with an icon. A bare text link in an
  action row does not read as tappable on a phone.
- Device stats live inside that device's bordered card, never between cards.
- Charts need `@source` for any library classes they rely on (see the LayerChart
  note at the top of `src/app.css`), or SVG paths render with the default black
  fill.

## Accessibility

- Every icon-only control has an `aria-label`.
- Touch targets are at least 36px; `btn-sm` and `btn-xs` are raised in
  `src/app.css` for this reason.
- Status is never conveyed by color alone; `StatusPill` and permission rows carry
  the word as well.
- Charts and timelines have a text alternative; gap counts are stated instead of
  drawing a line through missing data.

## Adding a page

1. Decide which tab owns it. If none does, it belongs under Settings.
2. Use `PageHeading` for the title and `Card` for each group.
3. Hydrate any new store in `src/routes/(app)/+layout.svelte`.
4. Add the route to the navigation table above.
5. Check it in both Mocha and Latte, and at a narrow phone width.
