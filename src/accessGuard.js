// Cloudflare Access guard (task 603): stop trusting the Cf-Access-Authenticated-User-Email header and verify the signed token instead.
//
// Why: Access only protects traffic that goes THROUGH Cloudflare. The origin's public IP answers on 443 too, so a request sent straight to it
// (curl --resolve) skips Access, and a forged email header would be believed. Every request carries a Cf-Access-Jwt-Assertion token that only
// Cloudflare can sign. This middleware checks, per request: RS256 signature against the team's published keys, expiry, issuer, audience (the
// Application Audience tag of THIS Access app) and an email claim. Anything else (no token, alg none/HS256, wrong key, expired, wrong audience)
// gets 401. On success req.accessUser is the verified, lower-cased email.
//
//   const guard = createAccessGuard({ teamDomain: 'yourteam.cloudflareaccess.com', audience: '<aud tag>' });
//   app.get('/health', ...);   // mount anything that must stay open BEFORE the guard
//   app.use(guard);
//   createApiRoutes(config, { getUser: accessUser }).mount(app);
//
// Keys come from https://<team>/cdn-cgi/access/certs, are cached (10 min), and refetched at most once a minute when an unknown key id shows up
// (key rotation) so a flood of bad tokens cannot turn into a flood of fetches.
import crypto from 'node:crypto';

const b64u = (s) => Buffer.from(s, 'base64url');
const cookie = (header, name) => {
  const m = String(header || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : undefined;
};

export function createAccessGuard({ teamDomain, audience, jwksUrl, fetchImpl = globalThis.fetch, now = () => Date.now(), ttlMs = 600000, refetchMinMs = 60000 }) {
  if (!teamDomain || !audience) throw new Error('createAccessGuard needs teamDomain and audience');
  const issuer = `https://${teamDomain}`;
  const certsUrl = jwksUrl || `${issuer}/cdn-cgi/access/certs`;
  let keys = null; let fetchedAt = 0;

  async function loadKeys(force) {
    const age = now() - fetchedAt;
    if (keys && (force ? age < refetchMinMs : age < ttlMs)) return keys;
    const r = await fetchImpl(certsUrl);
    if (!r.ok) throw new Error('key fetch failed (' + r.status + ')');
    keys = (await r.json()).keys || []; fetchedAt = now();
    return keys;
  }

  async function verify(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('malformed token');
    let header; let payload;
    try { header = JSON.parse(b64u(parts[0]).toString()); payload = JSON.parse(b64u(parts[1]).toString()); } catch { throw new Error('malformed token'); }
    if (header.alg !== 'RS256') throw new Error('unsupported alg');
    let jwk = (await loadKeys(false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await loadKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('unknown key id');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), b64u(parts[2]));
    if (!ok) throw new Error('bad signature');
    const sec = Math.floor(now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= sec) throw new Error('expired');
    if (typeof payload.nbf === 'number' && payload.nbf > sec + 60) throw new Error('not yet valid');
    if (payload.iss !== issuer) throw new Error('wrong issuer');
    if (!(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(audience)) throw new Error('wrong audience');
    if (!payload.email) throw new Error('no email claim');
    return payload;
  }

  async function guard(req, res, next) {
    try {
      const payload = await verify(req.headers?.['cf-access-jwt-assertion'] || cookie(req.headers?.cookie, 'CF_Authorization'));
      req.accessUser = String(payload.email).toLowerCase();
      return next();
    } catch (err) {
      console.warn('[access-guard] refused:', err.message);
      return res.status(401).type('text').send('Unauthorized');
    }
  }
  guard.verify = verify;
  return guard;
}

// getUser for createApiRoutes: the verified email, else 'system' (never the raw header).
export const accessUser = (req) => req.accessUser || 'system';
