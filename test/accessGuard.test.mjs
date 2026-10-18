// Unit tests for createAccessGuard (task 603). Real RSA keys and signed tokens; the key endpoint is stubbed. Run: node test/accessGuard.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAccessGuard, accessUser } from '../src/accessGuard.js';

const TEAM = 'myteam.cloudflareaccess.com'; const AUD = 'aud-tag-123';
const mk = () => { const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); return { privateKey, jwk: publicKey.export({ format: 'jwk' }) }; };
const good = mk(); const other = mk();
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let clock = 1_800_000_000_000; const nowSec = () => Math.floor(clock / 1000);
const sign = (payload, { kid = 'k1', alg = 'RS256', key = good.privateKey } = {}) => {
  const head = b({ alg, kid, typ: 'JWT' }); const body = b(payload);
  const sig = alg === 'RS256' ? crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url') : '';
  return head + '.' + body + '.' + sig;
};
const claims = (over = {}) => ({ iss: 'https://' + TEAM, aud: [AUD], email: 'Paul@Example.com', exp: nowSec() + 600, iat: nowSec(), ...over });
let keysServed = [{ ...good.jwk, kid: 'k1', alg: 'RS256', use: 'sig' }]; let fetches = 0;
const fetchImpl = async () => { fetches++; return new Response(JSON.stringify({ keys: keysServed }), { status: 200 }); };
const guard = () => createAccessGuard({ teamDomain: TEAM, audience: AUD, fetchImpl, now: () => clock });
const run = async (g, headers) => { const req = { headers }; const res = { code: 200, status(c) { res.code = c; return res; }, type() { return res; }, send(b) { res.body = b; return res; } }; let nexted = false; await g(req, res, () => { nexted = true; }); return { req, res, nexted }; };
let passed = 0; const t = async (name, fn) => { fetches = 0; await fn(); passed++; console.log('PASS ' + name); };
console.warn = () => {};

await t('a valid token passes and req.accessUser is the lower-cased email', async () => {
  const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims()) });
  assert.ok(r.nexted); assert.equal(r.req.accessUser, 'paul@example.com'); assert.equal(accessUser(r.req), 'paul@example.com');
});
await t('the same token in the CF_Authorization cookie is accepted too', async () => {
  const r = await run(guard(), { cookie: 'a=1; CF_Authorization=' + sign(claims()) + '; b=2' }); assert.ok(r.nexted);
});
await t('no token -> 401, never next()', async () => { const r = await run(guard(), {}); assert.equal(r.res.code, 401); assert.ok(!r.nexted); });
await t('a forged email header alone is worthless (the whole point)', async () => {
  const r = await run(guard(), { 'cf-access-authenticated-user-email': 'paul@example.com' }); assert.equal(r.res.code, 401); assert.ok(!r.nexted);
});
await t('garbage and truncated tokens are refused', async () => {
  for (const tok of ['x', 'a.b', 'a.b.c', sign(claims()).slice(0, -5)]) { const r = await run(guard(), { 'cf-access-jwt-assertion': tok }); assert.equal(r.res.code, 401); }
});
await t('alg none and HS256 are refused (algorithm confusion)', async () => {
  for (const alg of ['none', 'HS256']) { const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims(), { alg }) }); assert.equal(r.res.code, 401); }
});
await t('a token signed by a different key is refused', async () => {
  const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims(), { key: other.privateKey }) }); assert.equal(r.res.code, 401);
});
await t('an expired token is refused', async () => {
  const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims({ exp: nowSec() - 5 })) }); assert.equal(r.res.code, 401);
});
await t('wrong audience (another Access app) and wrong issuer are refused', async () => {
  for (const over of [{ aud: ['someone-elses-app'] }, { aud: 'someone-elses-app' }, { iss: 'https://evil.example' }]) { const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims(over)) }); assert.equal(r.res.code, 401); }
});
await t('a token with no email claim is refused', async () => {
  const c = claims(); delete c.email; const r = await run(guard(), { 'cf-access-jwt-assertion': sign(c) }); assert.equal(r.res.code, 401);
});
await t('a string audience equal to ours is accepted (Cloudflare may send a string or an array)', async () => {
  const r = await run(guard(), { 'cf-access-jwt-assertion': sign(claims({ aud: AUD })) }); assert.ok(r.nexted);
});
await t('keys are cached: many requests, one fetch', async () => {
  const g = guard(); for (let i = 0; i < 5; i++) await run(g, { 'cf-access-jwt-assertion': sign(claims()) }); assert.equal(fetches, 1);
});
await t('key rotation: an unknown kid triggers ONE refetch and then passes', async () => {
  const g = guard(); await run(g, { 'cf-access-jwt-assertion': sign(claims()) });
  clock += 120000; keysServed = [{ ...good.jwk, kid: 'k2' }]; fetches = 0;
  const r = await run(g, { 'cf-access-jwt-assertion': sign(claims({ exp: nowSec() + 600 }), { kid: 'k2' }) }); assert.ok(r.nexted); assert.equal(fetches, 1);
  keysServed = [{ ...good.jwk, kid: 'k1' }];
});
await t('a flood of bad key ids cannot cause a flood of fetches (at most one a minute)', async () => {
  const g = guard(); await run(g, { 'cf-access-jwt-assertion': sign(claims()) }); fetches = 0;
  for (let i = 0; i < 10; i++) await run(g, { 'cf-access-jwt-assertion': sign(claims(), { kid: 'nope' + i }) });
  assert.ok(fetches <= 1, 'fetches=' + fetches);
});
await t('the key endpoint being down refuses the request (fail closed)', async () => {
  const g = createAccessGuard({ teamDomain: TEAM, audience: AUD, fetchImpl: async () => new Response('x', { status: 503 }), now: () => clock });
  const r = await run(g, { 'cf-access-jwt-assertion': sign(claims()) }); assert.equal(r.res.code, 401); assert.ok(!r.nexted);
});
await t('accessUser falls back to system, never to a raw header', async () => { assert.equal(accessUser({ headers: { 'cf-access-authenticated-user-email': 'x@y.z' } }), 'system'); });
await t('createAccessGuard refuses to be built without a team domain and audience', async () => {
  assert.throws(() => createAccessGuard({ audience: AUD }), /teamDomain/); assert.throws(() => createAccessGuard({ teamDomain: TEAM }), /audience/);
});
console.log(`\n${passed} passed`);
