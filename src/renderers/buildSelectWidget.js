import { escapeHtmlAttr } from './htmlUtils.js';

export function buildSelectWidget(component, slotAttrs = {}) {
  const { comp_name, template_name, template_title } = component;
  let actions = component.actions || {};

  if (typeof actions === 'string') {
    try {
      actions = JSON.parse(actions);
    } catch {
      actions = {};
    }
  }

  const hxVals = {
    template_name,
    ...slotAttrs
  };

  const attrs = [
    `id="${comp_name}"`,
    `data-template-name="${escapeHtmlAttr(template_name)}"`,
    `data-widget="select"`,
    `hx-post="/api/hydrate"`,
    `hx-trigger="load"`,
    // Same contextStore merge as buildHtmxDiv - a dropdown re-rendered via
    // refresh-component should see current filter state too, not just its
    // own template_name/slotAttrs.
    `hx-vals='js:{...${JSON.stringify(hxVals)}, ...(window.contextStore||{})}'`,
    `hx-swap="innerHTML"`
  ];

  if (Object.keys(actions).length > 0) {
    attrs.push(`data-actions='${escapeHtmlAttr(JSON.stringify(actions))}'`);
  }

  // Slot attrs: name, data-field, data-selected-value, etc.
  if (slotAttrs && Object.keys(slotAttrs).length > 0) {
    for (const [key, val] of Object.entries(slotAttrs)) {
      attrs.push(`${key}="${escapeHtmlAttr(val)}"`);
    }
  }

  if (!template_title) {
    throw new Error(`Select widget "${template_name}" missing required template_title for label`);
  }

  return `<div class="dropdown-label">${escapeHtmlAttr(template_title)}</div><div ${attrs.join(' ')}></div>`;
}
