// Unit tests for createApiRoutes (task 598). No network: fetch is stubbed. Run: node test/apiRoutes.test.mjs
import assert from 'node:assert/strict';
const calls = [];
let reply = () => new Response(JSON.stringify([{ html: '<p>ok</p>' }]), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return reply(); };
process.env.N8N_BASE_URL = 'https://n8n.test';
const { createApiRoutes } = await import('../src/apiRoutes.js');

const res = () => { const r = { code: 200, headers: {}, body: undefined, status(c) { r.code = c; return r; }, type(t) { r.headers.type = t; return r; }, send(b) { r.body = b; return r; }, json(b) { r.body = b; r.headers.type = 'json'; return r; } }; return r; };
const config = { schema: 'consulting', source: 'app_engine' };
const api = createApiRoutes(config, { getUser: (req) => req.user || 'tester' });
let passed = 0; const t = async (name, fn) => { calls.length = 0; await fn(); passed++; console.log('PASS ' + name); };

await t('hydrate: calls app-hydrate-guide with the template and the context', async () => {
  const r = res(); await api.hydrate({ body: { template_name: 'clients_grid', client_id: '2' } }, r);
  assert.equal(r.code, 200); assert.equal(r.body, '<p>ok</p>'); assert.equal(r.headers.type, 'html');
  assert.equal(calls[0].url, 'https://n8n.test/webhook/app-hydrate-guide');
  assert.deepEqual(calls[0].body, { client_id: '2', schema: 'consulting', source: 'app_engine', template_name: 'clients_grid' });
});
await t('hydrate: a client CANNOT override schema or source', async () => {
  const r = res(); await api.hydrate({ body: { template_name: 'x', schema: 'agile', source: 'wf-server' } }, r);
  assert.equal(calls[0].body.schema, 'consulting'); assert.equal(calls[0].body.source, 'app_engine');
});
await t('hydrate: rejects a missing or malformed template name before any request', async () => {
  for (const body of [{}, { template_name: '../x' }, { template_name: 'a b' }, { template_name: "x';drop" }]) { const r = res(); await api.hydrate({ body }, r); assert.equal(r.code, 400); }
  assert.equal(calls.length, 0);
});
await t('hydrate: honours the n8n respond formats (array, object, string)', async () => {
  for (const [payload, want] of [[[{ html: 'A' }], 'A'], [{ html: 'B' }, 'B'], ['C', 'C']]) {
    reply = () => new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status: 200, headers: { 'content-type': typeof payload === 'string' ? 'text/html' : 'application/json' } });
    const r = res(); await api.hydrate({ body: { template_name: 'x' } }, r); assert.equal(r.body, want);
  }
  reply = () => new Response(JSON.stringify([{ html: '<p>ok</p>' }]), { status: 200, headers: { 'content-type': 'application/json' } });
});
await t('hydrate: an upstream failure is a generic 500 (no internals leak)', async () => {
  reply = () => new Response('boom: password authentication failed', { status: 500 });
  const r = res(); await api.hydrate({ body: { template_name: 'x' } }, r);
  assert.equal(r.code, 500); assert.equal(r.body, 'Hydrate failed');
  reply = () => new Response(JSON.stringify([{ html: '<p>ok</p>' }]), { status: 200, headers: { 'content-type': 'application/json' } });
});
await t('dml: maps record_id to pk_val, fields to data, stamps the user, fixes the schema', async () => {
  reply = () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = res(); await api.dml({ user: 'paul', body: { page_id: '4', mode: 'UPDATE', record_id: '7', name: 'X', schema: 'agile' } }, r);
  assert.deepEqual(r.body, { success: true });
  assert.equal(calls[0].url, 'https://n8n.test/webhook/app-engine-actions');
  assert.deepEqual(calls[0].body, { schema: 'consulting', page_id: 4, mode: 'UPDATE', data: { name: 'X', schema: 'agile' }, pk_val: 7, user: 'paul' });
});
await t('dml: INSERT has no pk, blank record_id counts as none', async () => {
  const r = res(); await api.dml({ body: { page_id: 4, mode: 'INSERT', record_id: '', name: 'N' } }, r);
  assert.equal(calls[0].body.pk_val, null); assert.equal(calls[0].body.user, 'tester');
});
await t('dml: rejects a bad mode, page id or record id before any request', async () => {
  for (const body of [{ page_id: 4, mode: 'DROP' }, { page_id: 'abc', mode: 'INSERT' }, { mode: 'INSERT' }, { page_id: 4, mode: 'UPDATE', record_id: 'x' }, { page_id: -1, mode: 'INSERT' }]) { const r = res(); await api.dml({ body }, r); assert.equal(r.code, 400); }
  assert.equal(calls.length, 0);
});
await t('dml: the default user comes from the Cloudflare Access header, else system', async () => {
  const plain = createApiRoutes(config);
  await plain.dml({ headers: { 'cf-access-authenticated-user-email': 'p@example.com' }, body: { page_id: 4, mode: 'INSERT', x: 1 } }, res());
  await plain.dml({ headers: {}, body: { page_id: 4, mode: 'INSERT', x: 1 } }, res());
  assert.equal(calls[0].body.user, 'p@example.com'); assert.equal(calls[1].body.user, 'system');
});
await t('report: hydrates every template and joins the HTML in order', async () => {
  let n = 0; reply = () => new Response(JSON.stringify([{ html: `<i>${++n}</i>` }]), { status: 200, headers: { 'content-type': 'application/json' } });
  const r = res(); await api.report({ body: { templates: ['rpt_a', 'rpt_b'], id: 41, schema: 'agile' } }, r);
  assert.equal(r.code, 200); assert.equal(r.headers.type, 'html'); assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.body.template_name).sort(), ['rpt_a', 'rpt_b']);
  assert.ok(calls.every((c) => c.body.id === 41 && c.body.schema === 'consulting'));
  reply = () => new Response(JSON.stringify([{ html: '<p>ok</p>' }]), { status: 200, headers: { 'content-type': 'application/json' } });
});
await t('report: rejects a missing list or a bad name; an upstream failure is a generic 500', async () => {
  for (const body of [{}, { templates: [] }, { templates: ['ok', '../x'] }, { templates: 'rpt' }]) { const r = res(); await api.report({ body }, r); assert.equal(r.code, 400); }
  assert.equal(calls.length, 0);
  reply = () => new Response('x', { status: 500 }); const r = res(); await api.report({ body: { templates: ['rpt_a'] } }, r);
  assert.equal(r.code, 500); assert.equal(r.body, 'Report generation failed');
});
await t('mount: registers the three routes on whatever app it is given', async () => {
  const seen = []; const app = { post: (p, h) => seen.push([p, typeof h]) };
  assert.equal(api.mount(app), app); assert.deepEqual(seen, [['/api/hydrate', 'function'], ['/api/dml', 'function'], ['/api/report', 'function']]);
});
await t('a config without a schema is refused at construction', async () => {
  assert.throws(() => createApiRoutes({}), /schema/);
});
console.log(`\n${passed} passed`);

// ---- loadRoutes (task 598) ----
{
  const { loadRoutes } = await import('../src/loadRoutes.js');
  calls.length = 0;
  reply = () => new Response(JSON.stringify([{ route: '/clients', page_name: 'clients', page_id: 4, group_name: 'consulting' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  const rows = await loadRoutes(config);
  assert.deepEqual(rows, [{ route: '/clients', page_name: 'clients', page_id: 4, group_name: 'consulting' }]);
  assert.equal(calls[0].url, 'https://n8n.test/webhook/server-query');
  assert.match(calls[0].body.query, /FROM consulting\.vw_pages/);
  reply = () => new Response('', { status: 200 }); assert.deepEqual(await loadRoutes(config), []);
  await assert.rejects(() => loadRoutes({ schema: 'a; drop table x' }), /plain schema/);
  await assert.rejects(() => loadRoutes({}), /plain schema/);
  console.log('PASS loadRoutes: reads <schema>.vw_pages, tolerates an empty reply, refuses an unsafe schema name');
}
