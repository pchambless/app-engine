# app-engine

Shared render/action engine (server + client) for htmx-driven CRUD apps, extracted from
wf-server. Consumed by dependent apps as a plain git dependency
(`"app-engine": "github:pchambless/app-engine#main"`) - no registry, no publish step.

## Status: render/action engine ported (Sprint 328, points 2-3 of Epic 303)

The DB half (`app_engine` Postgres schema, schema-parameterized `api_select_form`, the
`apps` registry, `tf_template_router`) shipped 2026-08-29 (task 329). This ports the JS
half: wf-server's `src/renderers/**` (17 files, 1851 lines) - the piece that was
deliberately held for a dedicated session because it isn't a pure copy. wf-server's own
files are untouched (Path A stays frozen); nothing consumes this package yet - that's the
next app (agile.whatsfresh.app or whatever gets scaffolded first).

Source of truth for scope and status: `agile.agile_cache`, Epic 303 / Sprint 328 (app id 58).

## What this holds

**Fully generic, ported byte-identical to wf-server's source** (verified by diff):
`normalizeHtml`, `buildHtmxDiv`, `buildSelectWidget`, `buildCrudButtons`, `hydrateSlots`,
and the client-side action engine bundle - `actionEngine`, `actionHandlers`, `formActions`,
`formHydration`, `gridActions`, `selectActions`, `reportActions`.

**Parameterized** (the real judgment work - wf-server's copies hardcode a schema name,
specific template names, and a login path; these take an `AppConfig` object instead, see
`src/config.js`):
- `renderPage.js` - now `createRenderPage(config)`, returns `{ renderPage, setRoutes }`
  bound to that config (each app gets its own route cache, no shared module state).
- `resolveLayout.js` - takes `(components, config)`.
- `wrapHtml/index.js` - takes `(title, body, config)`; `config.extraScripts` lets a
  consuming app inject app-specific client JS without touching engine source.

**Genericized rather than ported as-is** (wf-server's version hardcodes app-specific
behavior that doesn't belong in a shared engine):
- `workerPicker.js` - was hardcoded to field ids `f_workers`/`workers_display`. Now reads
  `data-target-field`/`data-display-target` off the `#worker_checkboxes` container instead,
  so it's a real reusable checkbox-multiselect widget, not WhatsFresh-specific.
- `popActions.js` - wf-server's copy has a "Best By Date auto-calc" block
  (`f_event_date`/`f_best_by_date`/`f_best_by_days`) that's pure WhatsFresh batch-domain
  logic. Removed here; a consuming app that needs it supplies it via `extraScripts`.

**Supporting utility**: `src/utils/n8nClient.js` - three of the ported files depend on it.
Same webhook-calling logic as wf-server's copy, minus the winston/file-rotation logging
dependency (a library shouldn't force log config onto every consumer) - plain `console`
output instead.

## What this does NOT hold (yet, or ever)

- **`batchMapRoutes.js`** - was in an earlier draft of this scope. It's pure WhatsFresh
  batch-mapping business logic (calls the `dml-batch-map` n8n workflow). Never belonged here.
- **`hydrateRoutes`/`actionRoutes`/`dmlRoutes`/`apiRoutes`** - deliberately deferred, not
  dropped. They call n8n webhooks by fixed name (`hydrate-guide`, `dml`, `setvals`,
  `clearvals`, `page-structure`) and inline raw SQL against
  `studio.page_components`/`studio.html_templates`. Whether the next app reuses those exact
  webhook names or gets schema-parameterized equivalents (mirroring what happened to
  `api_select_form` on the DB side) is a real open question, best answered once a second app
  actually exists to prove it against - not guessed at here.
- Anything whatsfresh-schema-specific (`c_getval`, `context_store`) - the engine takes
  schema/context configuration as input, it doesn't assume a particular app's schema.
- wf-server's own app-specific chrome (login flow, appbar branding, theme CSS) - supplied
  by a consuming app via `AppConfig`.

## Config contract

See `src/config.js` for the full `AppConfig` typedef. It's the JS-side mirror of what an
`app_engine.apps` row describes - whether these values should eventually live in
`app_engine.apps.data` (jsonb) instead of being assembled in a consuming app's own code is
an open follow-up, not decided (no second app yet to know what's actually needed).
