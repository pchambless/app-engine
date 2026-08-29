import { escapeHtmlAttr } from './htmlUtils.js';

export function buildCrudButtons(pageInfo) {
  if (pageInfo.templateType !== 'crud') return '';

  const contextKey = pageInfo.contextKey || 'id';
  const formTemplate = pageInfo.formTemplate;
  const gridTemplate = pageInfo.gridTemplate;
  const pageId = pageInfo.pageID;

  if (!formTemplate && !gridTemplate) return '';

  const actions = {};

  if (formTemplate) {
    actions.add_new = [
      {
        action: 'setVals',
        values: { mode: 'INSERT', [contextKey]: null, page_id: pageId }
      },
      {
        action: 'open_modal',
        form_template: formTemplate,
        targets: ['form_modal']
      }
    ];
  }

  if (gridTemplate) {
    actions.delete_selected = {
      action: 'row_delete',
      values: { mode: 'DELETE', page_id: pageId },
      targets: [gridTemplate]
    };
  }

  const buttons = [];
  if (formTemplate) {
    buttons.push('<button type="button" data-trigger="add_new" class="wf-slot-action-btn">Add New</button>');
  }
  if (gridTemplate) {
    buttons.push('<button type="button" data-trigger="delete_selected" class="wf-slot-action-btn wf-btn-danger">Delete Selected</button>');
  }

  return `<div class="wf-slot-actions" data-actions='${escapeHtmlAttr(JSON.stringify(actions))}'>${buttons.join('')}</div>`;
}
