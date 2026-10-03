import { h } from './dom.js';

/**
 * Title plus tabs. Each tab renders lazily into its own pane the first time it is opened.
 * tabs: [{ id, label, render(el) }]
 */
export function renderTabs(container, tabs, { initial = tabs[0].id, onChange } = {}) {
  const panes = new Map();
  const buttons = new Map();

  const activate = (id) => {
    for (const [tid, btn] of buttons) {
      btn.setAttribute('aria-selected', String(tid === id));
      btn.tabIndex = tid === id ? 0 : -1;
    }
    for (const [tid, pane] of panes) pane.hidden = tid !== id;
    if (!panes.has(id)) {
      const pane = h('div', { role: 'tabpanel', class: 'bcf-pane' });
      panes.set(id, pane);
      body.append(pane);
      tabs.find((t) => t.id === id).render(pane);
    }
    onChange?.(id);
  };

  const list = h('div', { role: 'tablist', class: 'bcf-tabs' },
    tabs.map((t) => {
      const btn = h('button', { role: 'tab', type: 'button', onClick: () => activate(t.id) }, t.label);
      buttons.set(t.id, btn);
      return btn;
    }));
  const body = h('div');

  container.replaceChildren(
    h('header', { class: 'bcf-header' }, h('h2', {}, 'Capacity forecast'), list),
    body,
  );
  activate(initial);
}
