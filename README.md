# app-engine

Shared render/action engine (server + client) for htmx-driven CRUD apps, extracted from
wf-server. Consumed by dependent apps as a plain git dependency
(`"app-engine": "github:pchambless/app-engine#main"`) - no registry, no publish step.

## Status: skeleton only

Repo scaffolding exists; the actual engine code has not been moved in yet. That move is
deliberately held for its own focused session, because it turned out to involve real
design decisions - not a pure copy - since wf-server's current engine code has some
wf-server-specific behavior baked in (login-redirect handling, theme-specific CSS class
names, page-context shape assumptions) that needs to be separated from what's genuinely
generic before it lands here.

Source of truth for scope and status: `agile.agile_cache`, Epic 303 / Sprint 328 / task 329
(app id 58).

## What this will eventually hold

- Client-side action/render engine (currently wf-server's `src/renderers/wrapHtml/*`):
  actionEngine, actionHandlers, gridActions, selectActions, formActions, reportActions,
  popActions, workerPicker, formHydration.
- Server-side renderers (currently wf-server's `src/renderers/*`): renderPage,
  normalizeHtml, resolveLayout, hydrateSlots, buildCrudButtons, buildHtmxDiv,
  buildSelectWidget.
- The routes that wire them up (currently wf-server's `src/routes/*`): hydrateRoutes,
  actionRoutes, dmlRoutes, apiRoutes, batchMapRoutes.

## What this will NOT hold

- Anything whatsfresh-schema-specific (`c_getval`, `context_store`) - the engine takes
  schema/context configuration as input, it doesn't assume a particular app's schema.
- wf-server's own app-specific chrome (login flow, appbar branding, theme CSS).
