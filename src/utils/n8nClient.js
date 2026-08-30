// Thin n8n webhook client. No winston/file-logging dependency here (a
// library shouldn't force log-rotation config onto every consumer) - plain
// console output, structured enough to grep. If a consuming app wants its
// own structured logging, it can wrap callWorkflow itself.
const BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.whatsfresh.app';
const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;
const REDACT_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'apiKey']);

if (!WEBHOOK_SECRET) {
  console.warn('[n8nClient] N8N_WEBHOOK_SECRET not set - calls will go out without the shared-secret header');
}

export { BASE_URL as N8N_BASE };

function redactValue(value, key = '') {
  if (REDACT_KEYS.has(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey)])
    );
  }
  return value;
}

export async function callWorkflow(webhookPath, body = {}) {
  const url = `${BASE_URL}/webhook/${webhookPath}`;
  const payload = JSON.stringify(body);
  const startedAt = Date.now();
  const safeBody = redactValue(body);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {})
      },
      body: payload
    });
  } catch (err) {
    console.error('[n8nClient] Request failed', {
      webhookPath,
      durationMs: Date.now() - startedAt,
      body: safeBody,
      error: err.message
    });
    throw new Error(`n8n unreachable [${webhookPath}]: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error('[n8nClient] Response failed', {
      webhookPath,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      body: safeBody,
      responseText: text
    });
    throw new Error(`n8n error [${webhookPath}] ${response.status}: ${text}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    return response.text();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed[0]?._isHtml) {
      return parsed[0].html;
    }
    return parsed;
  } catch {
    return text;
  }
}
