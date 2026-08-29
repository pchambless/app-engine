import { callWorkflow } from '../utils/n8nClient.js';
import { buildHtmxDiv } from './buildHtmxDiv.js';
import { buildSelectWidget } from './buildSelectWidget.js';
import { normalizeHtml } from './normalizeHtml.js';

function buildSlotActionsHtml(slotActions = [], slotName = '') {
  if (!Array.isArray(slotActions) || slotActions.length === 0) return '';

  const ordered = [...slotActions].sort((a, b) => {
    const groupA = Number(a?.group_order ?? 0);
    const groupB = Number(b?.group_order ?? 0);
    if (groupA !== groupB) return groupA - groupB;

    const compA = Number(a?.comp_order ?? 0);
    const compB = Number(b?.comp_order ?? 0);
    if (compA !== compB) return compA - compB;

    return String(a?.component_name ?? '').localeCompare(String(b?.component_name ?? ''));
  });

  // Context-btn slot: render with full action wiring (data-actions + data-trigger)
  if (slotName === 'context-btn') {
    const actions = {};
    const buttons = ordered.map((item) => {
      const trigger = item.component_name + '_click';
      if (item.action_type === 'redirect') {
        actions[trigger] = { action: 'redirect', payload: { url: item.actions?.url } };
      } else if (item.action_type === 'open_report') {
        actions[trigger] = { action: 'open_report', templates: item.actions?.templates || [] };
      } else {
        actions[trigger] = { action: item.action_type, ...item.actions };
      }
      const visibilityClass = item.visible_when === 'always' ? 'wf-always-visible' : 'wf-row-click-only';
      return `<button type="button" class="wf-slot-action-btn wf-context-btn ${visibilityClass}" data-trigger="${trigger}">${String(item.label || item.component_name)}</button>`;
    }).join('');

    return `<div id="context_actions" class="wf-slot-actions wf-context-btn-group" data-actions='${JSON.stringify(actions)}'>${buttons}</div>`;
  }

  // Default rendering for other slots
  const buttons = ordered
    .map((action) => {
      const id = String(action?.component_name || action?.id || 'slot_action');
      const label = String(action?.label || id);
      return `<button type="button" id="${id}" class="wf-slot-action-btn">${label}</button>`;
    })
    .join('');

  return `<div class="wf-slot-actions">${buttons}</div>`;
}

function parseSlotAttrs(attrString) {
  const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  const attrs = {};
  let m;
  while ((m = attrRegex.exec(attrString)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export async function hydrateSlots(pageHtml, components, slotActions, email) {
  const slotComponents = new Map(
    components
      .filter(c => c.slot_name && c.comp_name !== 'appbar' && c.slot_name !== 'context-btn')
      .map(c => [c.slot_name, c])
  );
  const defaultSlotTemplateCache = new Map();

  // Matches:
  //   {{slot:name}}
  //   {{slot:name:default_template}}
  //   {{slot:name key="value" key2="value2"}}
  const slotTokenRegex = /\{\{slot:([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\}\}/g;
  const slotTokens = [...pageHtml.matchAll(slotTokenRegex)];

  for (const match of slotTokens) {
    const token = match[0];
    const slotName = match[1];
    const defaultTemplateName = match[2] || null;
    const attrString = match[3] || '';
    const attrs = parseSlotAttrs(attrString);
    const component = slotComponents.get(slotName);

    if (component) {
      const builder = (component.widget_type === 'select' || component.comp_name.endsWith('_dd'))
        ? buildSelectWidget : buildHtmxDiv;
      pageHtml = pageHtml.split(token).join(builder(component, attrs));
      continue;
    }

    const actionsForSlot = Array.isArray(slotActions?.[slotName]) ? slotActions[slotName] : [];
    if (actionsForSlot.length > 0) {
      pageHtml = pageHtml.split(token).join(buildSlotActionsHtml(actionsForSlot, slotName));
      continue;
    }

    if (defaultTemplateName) {
      if (!defaultSlotTemplateCache.has(defaultTemplateName)) {
        const defaultTemplateResult = await callWorkflow('hydrate-guide', {
          template_name: defaultTemplateName,
          source: 'wf-server',
          format: 'html',
          ...(email ? { email } : {})
        });
        defaultSlotTemplateCache.set(defaultTemplateName, normalizeHtml(defaultTemplateResult));
      }
      pageHtml = pageHtml.split(token).join(defaultSlotTemplateCache.get(defaultTemplateName));
      continue;
    }

    // Slot has no component and no default template — render nothing
    pageHtml = pageHtml.split(token).join('');
  }

  return pageHtml;
}
