# Dreame Companion UI

The control-panel UI for the Dreame vacuum companion add-on, built with
**Next.js static export**, **atomic design**, and **CSS Modules**. It replaces
the hand-duplicated Jinja templates with a real component system.

## How it ships

- **Build:** `python3 build_ui.py` (runs `npm install` then `next build` with
  `output: 'export'`). Produces plain HTML/CSS/JS in `frontend/out/`.
- **Ship:** `frontend/out/` is **committed to the repo**. The add-on Dockerfile
  does `COPY frontend/out/ frontend/out/`. There is **no Node** in the Docker
  build or at runtime — the image just serves static files.
- **Serve:** Flask (`ui.py`) serves the app at `/ui/` and stays the JSON API
  backend. Each ported page fetches its data from a Flask endpoint at runtime;
  a static build cannot server-render live HA state.

## Architecture

```
src/
  app/            route pages (one per Flask "# /<page>" route eventually)
  components/
    atoms/        smallest building blocks (Badge, Card, Pill, Mono,
                  ValueTable, Popover, ...); each has its own .module.css
    molecules/    small composites (NavItem, SettingsGear, ContextMenu, ...)
    organisms/    larger sections (NavBar, DeviceCard, ...)
    layout/       page shells (PageShell / nav / footer)
  lib/            api.ts (fetch helpers), types.ts (API shapes), utils
  styles/         globals.css = design tokens / CSS variables
```

## Conventions (read before writing components)

- **CSS Modules everywhere.** No global class names except design tokens in
  `globals.css`. One `.module.css` per component, next to its `.tsx`.
- **Atomic design layers.** Atoms know nothing about their context; molecules
  combine atoms; organisms assemble molecules into page sections.
- **All popups/popovers/menus MUST use the `Popover` atom** (or a component
  built on it, like `ContextMenu` / `SettingsGear`). Popover portals into a
  `position:fixed` layer at `document.body`, so menus are **never clipped** by
  an ancestor's overflow/border-radius. Using a bare absolutely-positioned div
  for a menu is a bug — it will be cut off (this is a recurring failure mode in
  this codebase; see the settings gear + snapshot tag menus).
- **Data fetching is client-side and RELATIVE.** Pages are client components
  that `fetchJson("api/...")` — relative, no leading slash — so links/API calls
  resolve correctly under HA ingress's path prefix. Do not hard-code `/api/...`.
- **Use RELATIVE imports between components** (`../../atoms/...`). The `@/`
  alias was trialled but Next only honours it when `baseUrl`/`paths` are read
  from the exact tsconfig shape it expects, and relative imports are
  unambiguous and version-proof. Keep them consistent within a file.
- Design tokens (colours, spacing, radii, dark mode) live in
  `src/styles/globals.css`. Reuse the CSS variables; don't reintroduce
  hard-coded hex values per-component.

## Porting a page (the incremental play)

1. Create the page under `src/app/<name>/page.tsx` as a `"use client"` component.
2. Build it from existing atoms/molecules; add new atoms only when truly reusable.
3. Add/confirm a Flask `api/*` endpoint that returns the page's data as JSON.
4. `python3 build_ui.py`, backfill `ui.py` if needed, commit `out/` + source.
5. Next `update-ha-app` deploy picks up the new static files.

Harder pages (task_editor, tags, maps, video) are ported last — a canvas
renderer and heavy inline JS don't map cleanly to components, so they stay on
the old templates until the shared shell + data layer prove out.