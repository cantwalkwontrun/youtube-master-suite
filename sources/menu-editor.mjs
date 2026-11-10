// Language: en-GB. Self-contained native settings editor; labels are plain text.
export function createMenuEditor(document, layouts, options) {
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, label) => {
    const node = el('button', text); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    return node;
  };
  const section = el('section', undefined, 'menu-order menu-layout-editor');
  const heading = el('h3', 'Video context menu editor'); heading.id = 'ytms-menu-editor-heading'; heading.tabIndex = -1;
  const note = el('p', 'Create named submenus, move actions between menus, and change their order or visibility. Save and reload to apply. Other YouTube and extension actions remain available.', 'section-note');
  note.textContent += ` Up to ${layouts.limits.maxGroups} submenus and ${layouts.limits.maxDepth} nested levels.`;
  note.id = 'ytms-menu-order-description';
  const toolbar = el('div', undefined, 'menu-editor-toolbar');
  const menuLabel = el('label', 'Editing menu'); menuLabel.htmlFor = 'ytms-menu-location';
  const location = el('select'); location.id = menuLabel.htmlFor;
  const add = button('Add submenu'); add.id = 'ytms-add-submenu';
  const reset = button('Reset menu layout'); reset.id = 'ytms-reset-menu-layout';
  toolbar.append(menuLabel, location, add, reset);
  const groupFields = el('div', undefined, 'menu-editor-group');
  const nameLabel = el('label', 'Submenu name'); nameLabel.htmlFor = 'ytms-submenu-name';
  const name = el('input'); name.id = nameLabel.htmlFor; name.type = 'text'; name.maxLength = layouts.limits.maxNameLength;
  name.autocomplete = 'off';
  const remove = button('Delete submenu'); remove.id = 'ytms-delete-submenu';
  const groupHelp = el('p', 'Deleting a submenu moves its contents into its parent menu.', 'section-note');
  groupFields.append(nameLabel, name, remove, groupHelp);
  const status = el('p', '', 'section-note'); status.id = 'ytms-menu-editor-status'; status.setAttribute('role', 'status'); status.hidden = true;
  name.setAttribute('aria-describedby', status.id);
  const list = el('ol'); list.id = 'ytms-menu-order'; list.setAttribute('aria-label', 'Video context menu order');
  list.setAttribute('aria-describedby', note.id);
  const preview = el('details', undefined, 'menu-editor-preview');
  preview.append(el('summary', 'Menu preview'));
  const previewList = el('ul'); previewList.setAttribute('aria-label', 'Menu preview'); preview.append(previewList);
  section.append(heading, note, toolbar, groupFields, status, list, preview);
  let current = 'root', invalid = false;
  const effective = () => layouts.fromPreferences(options.getPreferences());
  const isGroup = node => !layouts.actionIds.includes(node.id);
  function label(node) { return isGroup(node) ? node.name : layouts.labels[node.id]; }
  function path(id, layout) {
    const result = []; let node = layout.nodes.find(item => item.id === id);
    while (node) { result.unshift(node.name); node = layout.nodes.find(item => item.id === node.parent); }
    return result.length ? result.join(' / ') : 'Main menu';
  }
  function announce(message, error = false) {
    status.textContent = message; status.hidden = !message;
    status.classList.toggle('error', error);
  }
  function commit(next, focusId, direction) {
    if (invalid) { name.focus(); return; }
    const checked = layouts.validate(next);
    if (!checked) { announce('This change would exceed the nesting limit or create an invalid menu.', true); return; }
    options.setLayout(checked); options.onChange(); render(focusId, direction);
  }
  function targets(layout, node) {
    return ['root', ...layout.nodes.filter(isGroup).map(item => item.id)].filter(parent => {
      if (parent === node.id) return false;
      const next = layouts.clone(layout); next.nodes.find(item => item.id === node.id).parent = parent;
      return Boolean(layouts.validate(next));
    });
  }
  function drawPreview(layout) {
    previewList.replaceChildren();
    function children(parent, target) {
      for (const node of layout.nodes.filter(item => item.parent === parent)) {
        if (!isGroup(node) && !node.visible) continue;
        const item = el('li', label(node));
        if (isGroup(node)) {
          const nested = el('ul'); children(node.id, nested);
          if (!nested.children.length) continue;
          item.append(nested);
        }
        target.append(item);
      }
    }
    children('root', previewList);
  }
  function render(focusId, direction) {
    const layout = effective();
    if (current !== 'root' && !layout.nodes.some(node => node.id === current && isGroup(node))) current = 'root';
    location.replaceChildren();
    for (const id of ['root', ...layout.nodes.filter(isGroup).map(node => node.id)]) {
      const option = el('option', path(id, layout)); option.value = id; location.append(option);
    }
    location.value = current;
    const selected = layout.nodes.find(node => node.id === current);
    groupFields.hidden = !selected;
    name.value = selected?.name || ''; name.setAttribute('aria-invalid', 'false');
    const count = layout.nodes.filter(isGroup).length;
    const trial = layouts.clone(layout); let available = 1;
    while (trial.nodes.some(node => node.id === `submenu-${available}`)) available++;
    trial.nodes.push({ id:`submenu-${available}`, name:'New submenu', parent:current });
    add.disabled = count >= layouts.limits.maxGroups || !layouts.validate(trial);
    add.title = `Up to ${layouts.limits.maxGroups} submenus and ${layouts.limits.maxDepth} nested submenu levels.`;
    list.replaceChildren();
    const siblings = layout.nodes.filter(node => node.parent === current);
    for (const [index, node] of siblings.entries()) {
      const item = el('li'); item.dataset.menuItem = node.id;
      const title = el('span', label(node), 'menu-editor-item-label');
      if (isGroup(node)) {
        const open = button(node.name + ' ›', `Edit ${node.name} submenu`);
        open.addEventListener('click', () => { if (invalid) return name.focus(); current = node.id; render(); name.focus(); });
        title.replaceChildren(open);
      } else {
        const visible = el('input'); visible.type = 'checkbox'; visible.checked = node.visible;
        visible.setAttribute('aria-label', `Show ${label(node)}`);
        const legacyIds = { download:'menuShowDownload', channelAge:'menuShowAgeLimit', notInterested:'menuShowNotInterested', dontRecommend:'menuShowDontRecommend', report:'menuShowReport' };
        visible.id = 'ytms-' + (legacyIds[node.id] || 'menu-action-' + node.id);
        visible.addEventListener('change', () => {
          const next = effective(); next.nodes.find(entry => entry.id === node.id).visible = visible.checked; commit(next);
        });
        const visibleLabel = el('label'); visibleLabel.append(visible, el('span', label(node))); title.replaceChildren(visibleLabel);
      }
      item.append(title);
      const parent = el('select'); parent.setAttribute('aria-label', `Menu for ${label(node)}`);
      for (const target of targets(layout, node)) { const option = el('option', path(target, layout)); option.value = target; parent.append(option); }
      parent.value = node.parent;
      parent.addEventListener('change', () => {
        const next = effective(); next.nodes.find(entry => entry.id === node.id).parent = parent.value; commit(next);
      });
      item.append(parent);
      for (const [word, symbol, offset] of [['up','↑',-1],['down','↓',1]]) {
        const move = button(symbol, `Move ${label(node)} ${word}`); move.className = 'menu-order-move'; move.dataset.direction = word;
        move.disabled = index + offset < 0 || index + offset >= siblings.length;
        move.addEventListener('click', () => {
          const next = effective(), first = next.nodes.findIndex(entry => entry.id === node.id),
            second = next.nodes.findIndex(entry => entry.id === siblings[index + offset].id);
          [next.nodes[first], next.nodes[second]] = [next.nodes[second], next.nodes[first]]; commit(next, node.id, word);
        });
        item.append(move);
      }
      list.append(item);
      if (focusId === node.id) {
        const preferred = item.querySelector(`[data-direction="${direction}"]`);
        (preferred?.disabled ? item.querySelector('button:not(:disabled)') : preferred)?.focus();
      }
    }
    if (!siblings.length) list.append(el('li', 'This submenu is empty. Move an action here using its Menu selector.', 'section-note'));
    drawPreview(layout);
  }
  location.addEventListener('change', () => {
    if (invalid) { location.value = current; name.focus(); return; }
    current = location.value; render();
  });
  name.addEventListener('input', () => {
    const next = effective(), node = next.nodes.find(item => item.id === current);
    if (!node) return;
    node.name = name.value.trim();
    const checked = layouts.validate(next);
    invalid = !checked; name.setAttribute('aria-invalid', String(invalid));
    announce(invalid ? `Enter a submenu name of 1–${layouts.limits.maxNameLength} characters without control characters.` : '', invalid);
    if (checked) { options.setLayout(checked); drawPreview(checked); }
    options.onChange();
  });
  name.addEventListener('change', () => {
    if (invalid) return;
    const layout = effective();
    name.value = layout.nodes.find(node => node.id === current)?.name || '';
    // Blur runs during pointer activation. Update labels in place so the
    // action being clicked is not detached before its click is dispatched.
    for (const select of section.querySelectorAll('select')) for (const option of select.options) {
      option.textContent = path(option.value, layout);
    }
  });
  add.addEventListener('click', () => {
    if (invalid) return name.focus();
    const next = effective(); let index = 1;
    while (next.nodes.some(node => node.id === `submenu-${index}`)) index++;
    const id = `submenu-${index}`; next.nodes.push({ id, name:'New submenu', parent:current });
    if (!layouts.validate(next)) { announce('The submenu or nesting limit has been reached.', true); return; }
    options.setLayout(next); current = id; options.onChange(); render(); name.focus(); name.select();
  });
  remove.addEventListener('click', () => {
    if (invalid) return name.focus();
    const next = effective(), selected = next.nodes.find(node => node.id === current);
    if (!selected) return;
    const children = next.nodes.filter(node => node.parent === current);
    const remaining = next.nodes.filter(node => node.id !== current && node.parent !== current);
    const index = next.nodes.filter(node => node.id !== current && node.parent !== current && next.nodes.indexOf(node) < next.nodes.indexOf(selected)).length;
    children.forEach(node => { node.parent = selected.parent; }); remaining.splice(index, 0, ...children); next.nodes = remaining;
    current = selected.parent; commit(next); announce('Submenu deleted. Its contents were moved to the parent menu. Save to apply.');
  });
  reset.addEventListener('click', () => { invalid = false; current = 'root'; options.onReset(); render(); announce('Default menu layout restored in this draft. Save to apply.'); });
  return Object.freeze({ element:section, heading, description:note, isValid:() => !invalid,
    focusAction(id) {
      if (invalid) return name;
      const node = effective().nodes.find(item => item.id === id && !isGroup(item));
      if (!node) return heading;
      current = node.parent; render();
      return [...list.children].find(item => item.dataset.menuItem === id)?.querySelector('input, button, select') || heading;
    },
    refresh() { invalid = false; announce(''); render(); } });
}
