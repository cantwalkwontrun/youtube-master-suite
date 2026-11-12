// Language: en-GB. Save custom code separately and require trusted user edits.
export function createCustomJavascriptPanel(document, service) {
  function node(tag, text, attributes = {}) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }
  const section = node('div', '', { class: 'custom-javascript', id: 'ytms-custom-js-heading', tabindex: '-1' });
  const warning = node('div', '', { class: 'custom-js-warning', id: 'ytms-custom-js-warning' });
  warning.append(node('strong', 'Run only code you understand and trust.'),
    node('p', 'Malicious code can read page data, act through your signed-in YouTube session, send information to other sites, alter settings or playback, and freeze the tab. A warning cannot make arbitrary code safe. The Suite cannot stop a long-running loop.'),
    node('p', 'If code prevents the page opening, disable this userscript in Tampermonkey or open https://www.youtube.com/?ytms-custom-js=off to skip it for that load. Then open these settings and disable the saved code.'));
  const note = node('div', '', { class: 'section-note custom-js-load-note' });
  note.append(
    node('p', 'Saved code runs once after the page DOM is ready on each full YouTube page load. YouTube’s internal navigation does not run it again. Saves take effect on the next load.'),
    node('p', 'The Suite saves code in this browser profile, separately from its settings and backups.'));
  const enabled = node('input', '', { id: 'ytms-custom-js-enabled', type: 'checkbox', role: 'switch', class: 'switch' });
  const enableLabel = node('label', 'Run saved JavaScript on page load', { for: enabled.id });
  const row = node('div', '', { class: 'row' }); row.append(enableLabel, enabled);
  const codeLabel = node('label', 'JavaScript code', { for: 'ytms-custom-js-code' });
  const codeHelp = node('p', 'Use regular JavaScript. Return a promise from async work to report failures here. Displayed code is readable by page scripts and extensions with page access. Code can conflict with other scripts or extensions.', { id: 'ytms-custom-js-help', class: 'section-note' });
  const code = node('textarea', '', { id: 'ytms-custom-js-code', maxlength: String(service.maxLength), rows: '14',
    spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-describedby': warning.id + ' ' + codeHelp.id });
  const ack = node('input', '', { id: 'ytms-custom-js-acknowledge', type: 'checkbox' });
  const ackLabel = node('label', '', { class: 'custom-js-acknowledgement' });
  ackLabel.append(ack, document.createTextNode('I understand this code can access page data and affect my account, playback and browser performance.'));
  const save = node('button', 'Save JavaScript', { id: 'ytms-custom-js-save', type: 'button', class: 'text-button primary' });
  const discard = node('button', 'Reload saved code', { id: 'ytms-custom-js-discard', type: 'button', class: 'text-button' });
  const actions = node('div', '', { class: 'custom-js-actions' }); actions.append(discard, save);
  const message = node('p', '', { id: 'ytms-custom-js-status', role: 'status', class: 'section-note' });
  section.append(warning, note, row, codeLabel, codeHelp, code, ackLabel, actions, message);
  let baseline = null, draft = { enabled: false, code: '' }, acknowledged = false, available = false, saving = false, generation = 0;
  let sessionOpen = false, visible = false, loaded = false, unsubscribe = null;
  const statuses = { ran: 'Saved code ran on this load.', failed: 'Custom JavaScript failed on this load. Review or disable it.',
    skipped: 'Custom JavaScript was skipped on this load.', unavailable: 'Saved JavaScript was unavailable on this load.',
    scheduled: 'Custom JavaScript is scheduled for this load.', disabled: 'Custom JavaScript was disabled when this page loaded.' };
  function isDirty() {
    return available && (draft.enabled !== baseline.value.enabled || draft.code !== baseline.value.code);
  }
  function syncEditor() {
    const displayed = visible && loaded ? draft.code : '';
    if (code.value !== displayed) code.value = displayed;
    enabled.checked = visible && draft.enabled;
    ack.checked = visible && acknowledged;
  }
  function render() {
    save.disabled = !visible || saving || !isDirty() || draft.enabled && (!acknowledged || !draft.code.trim());
    ackLabel.hidden = !visible || !draft.enabled;
    discard.disabled = !visible || saving;
    code.disabled = enabled.disabled = !visible || saving || !available;
    ack.disabled = !visible || saving;
  }
  function loadSaved() {
    generation++;
    baseline = service.read(); available = baseline.ok;
    draft = available ? { ...baseline.value } : { enabled: false, code: '' };
    acknowledged = false; loaded = true;
    syncEditor();
    message.textContent = available ? statuses[service.status] : baseline.error;
    render();
  }
  function close() {
    generation++;
    sessionOpen = visible = loaded = available = acknowledged = false;
    unsubscribe?.(); unsubscribe = null;
    baseline = null; draft = { enabled: false, code: '' };
    syncEditor(); message.textContent = ''; render();
  }
  function open() { close(); sessionOpen = true; }
  function selectTab(id) {
    unsubscribe?.(); unsubscribe = null;
    visible = sessionOpen && id === 'javascript';
    if (!visible) { syncEditor(); render(); return; }
    if (!loaded) loadSaved();
    else {
      syncEditor(); render();
      if (available && !saving && !isDirty()) message.textContent = statuses[service.status];
    }
    unsubscribe = service.subscribe(() => {
      if (!saving && !isDirty() && available) message.textContent = statuses[service.status];
    });
  }
  for (const input of [code, enabled]) input.addEventListener(input === code ? 'input' : 'change', event => {
    if (!event.isTrusted || !visible || saving || !available) return;
    if (input === code) draft = { ...draft, code: code.value };
    else draft = { ...draft, enabled: enabled.checked };
    acknowledged = false; syncEditor();
    message.textContent = 'Unsaved JavaScript draft.'; render();
  });
  ack.addEventListener('change', event => {
    if (!event.isTrusted || !visible || saving || !available) return;
    const matches = code.value === draft.code && enabled.checked === draft.enabled;
    acknowledged = matches && ack.checked;
    syncEditor(); render();
    if (!matches) message.textContent = 'The editor changed outside a trusted edit. Review the restored draft and acknowledge again.';
  });
  save.addEventListener('click', async event => {
    if (!event.isTrusted || !visible || saving || !available || save.disabled ||
        code.value !== draft.code || enabled.checked !== draft.enabled || (draft.enabled && (!acknowledged || !ack.checked))) return;
    const request = generation;
    saving = true; render();
    let result;
    try { result = await service.save({ ...draft }, baseline.raw, acknowledged); }
    catch { result = { ok: false, error: 'JavaScript could not be saved. Keep your draft and try again.' }; }
    finally { saving = false; render(); }
    if (request !== generation) {
      loaded = false;
      if (visible) loadSaved();
      return;
    }
    if (!result.ok) { message.textContent = result.error; return; }
    baseline = result; acknowledged = false; syncEditor(); render();
    message.textContent = draft.enabled ? 'JavaScript saved and enabled for the next full page load.' : 'JavaScript saved and disabled for future loads. Reload when ready. Changes already made to saved data or your account may persist.';
  });
  discard.addEventListener('click', event => { if (event.isTrusted && visible && !saving) loadSaved(); });
  for (const type of ['input', 'change']) section.addEventListener(type, event => event.stopPropagation());
  render();
  return Object.freeze({ element: section, open, close, selectTab,
    hasDraft: () => sessionOpen && isDirty(), isSaving: () => saving });
}
