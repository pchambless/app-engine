export function normalizeHtml(html) {
  if (!html) return '';

  if (typeof html === 'string') {
    return html.replace(/\\n/g, '\n');
  }

  if (Array.isArray(html)) {
    for (const item of html) {
      const normalized = normalizeHtml(item);
      if (normalized) return normalized;
    }
    return '';
  }

  if (typeof html === 'object') {
    if (typeof html.html === 'string' && html.html.length > 0) {
      return html.html.replace(/\\n/g, '\n');
    }

    if (html.data) {
      const fromData = normalizeHtml(html.data);
      if (fromData) return fromData;
    }
    if (html.body) {
      const fromBody = normalizeHtml(html.body);
      if (fromBody) return fromBody;
    }
    if (html.result) {
      const fromResult = normalizeHtml(html.result);
      if (fromResult) return fromResult;
    }
    if (html.output) {
      const fromOutput = normalizeHtml(html.output);
      if (fromOutput) return fromOutput;
    }
  }

  return '';
}
