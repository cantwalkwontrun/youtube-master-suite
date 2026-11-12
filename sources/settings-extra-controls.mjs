// Language: en-GB. Personal images and release sources stay in separate local storage.
export function createSettingsExtraControls(document, window, suite, dialog) {
  const find = id => dialog.querySelector(`#ytms-${id}`);
  const make = (tag, id, text) => {
    const node = document.createElement(tag);
    if (id) node.id = `ytms-${id}`;
    if (text) node.textContent = text;
    return node;
  };
  const button = (id, text) => {
    const node = make('button', id, text); node.type = 'button'; node.className = 'text-button outlined-button'; return node;
  };
  let opened = false, generation = 0, updateGeneration = 0, markerDraft = null, markerChanged = false, markerPreparing = false, markerConflict = false, markerBaseline = null, updateResult = null, sourceBaseline = '';
  let unsubscribeStorage = null;
  let markerSaving = false, sourceSaving = false;
  const writeMarker = suite.writeMarker || (callback => callback());
  const writeSource = suite.writeUpdateSource || (callback => callback());
  const marker = make('section', 'playhead-marker'); marker.className = 'extra-settings';
  const markerHeading = make('h3', 'playhead-marker-heading', 'Playback marker image');
  const markerNote = make('p', null, 'Replace the red playback dot with a small image. Your image stays in this browser profile and is saved separately from other settings.');
  markerNote.className = 'section-note';
  const fileLabel = make('label', null, 'Choose an image'); fileLabel.htmlFor = 'ytms-marker-file';
  const file = make('input', 'marker-file'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp';
  const preview = make('img', 'marker-preview'); preview.alt = 'Playback marker preview'; preview.width = 40; preview.height = 40; preview.hidden = true;
  const markerSizeLabel = make('label', null, 'Image size'); markerSizeLabel.htmlFor = 'ytms-marker-size';
  const markerSize = make('input', 'marker-size'); markerSize.type = 'range'; markerSize.min = '16'; markerSize.max = '40'; markerSize.step = '1';
  const markerSizeValue = make('output', 'marker-size-value'); markerSizeValue.htmlFor = markerSize.id;
  const markerSizeRow = make('div'); markerSizeRow.className = 'extra-settings-controls'; markerSizeRow.append(markerSizeLabel, markerSize, markerSizeValue, preview);
  const markerActions = make('div'); markerActions.className = 'extra-settings-controls';
  const markerSave = button('marker-save', 'Save image'); markerSave.classList.add('primary');
  const markerRemove = button('marker-remove', 'Restore red dot'); markerActions.append(markerSave, markerRemove);
  const markerStatus = make('p', 'marker-status'); markerStatus.className = 'section-note'; markerStatus.setAttribute('role', 'status');
  marker.append(markerHeading, markerNote, fileLabel, file, markerSizeRow, markerActions, markerStatus);
  find('section-player').append(marker);

  function renderMarker() {
    preview.hidden = !markerDraft;
    if (markerDraft) preview.src = markerDraft.dataUrl;
    else preview.removeAttribute('src');
    markerSize.value = String(markerDraft?.size || suite.playheadMarker.defaultSize);
    markerSizeValue.value = `${markerSize.value} px`; markerSize.disabled = markerSaving || markerPreparing || !markerDraft;
    markerSave.disabled = markerSaving || markerPreparing || markerConflict || !markerDraft || !markerChanged;
    markerRemove.disabled = markerSaving || markerConflict || !markerDraft;
  }
  function resetMarker() {
    const result = suite.playheadMarker.read();
    markerDraft = result.ok && result.value ? { ...result.value } : null;
    markerChanged = false; markerPreparing = false; markerConflict = false; markerBaseline = result.ok ? JSON.stringify(result.value) : null; file.value = '';
    markerStatus.textContent = result.ok ? '' : result.error;
    markerRemove.disabled = !result.ok || !markerDraft;
    renderMarker();
  }
  function markerPreflight() {
    const current = suite.playheadMarker.read();
    if (current.ok && JSON.stringify(current.value) === markerBaseline && !markerConflict) return true;
    markerConflict = true; markerRemove.disabled = true; renderMarker();
    markerStatus.textContent = current.ok ? 'The saved marker changed in another window. Close and reopen settings before saving or restoring the red dot.' : current.error;
    return false;
  }
  function markerWriteFailure(result) {
    if (!result.conflict) markerStatus.textContent = result.error;
    else if (markerPreflight()) markerStatus.textContent = 'The marker is still synchronising or changed in another window. Keep your draft and try again.';
  }
  file.addEventListener('change', async () => {
    const token = ++generation, selected = file.files?.[0];
    if (!selected) { markerPreparing = false; markerStatus.textContent = ''; renderMarker(); return; }
    markerPreparing = true; renderMarker(); markerStatus.textContent = 'Preparing image…';
    const result = await suite.playheadMarker.prepareFile(selected);
    if (!opened || token !== generation) return;
    markerPreparing = false;
    markerStatus.textContent = result.ok ? 'Preview ready. Save image to apply it.' : result.error;
    if (result.ok) { markerDraft = result.value; markerChanged = true; }
    renderMarker();
  });
  markerSize.addEventListener('input', () => {
    if (!markerDraft || markerPreparing || markerSaving) return;
    ++generation;
    markerDraft = { ...markerDraft, size: Number(markerSize.value) }; markerChanged = true; renderMarker();
  });
  markerSave.addEventListener('click', async event => {
    if (!event.isTrusted || !opened || markerSaving || !markerDraft || markerPreparing || markerSave.disabled) return;
    const token = generation, confirmed = { ...markerDraft }, baseline = markerBaseline;
    markerSaving = true; renderMarker();
    let result;
    try { result = await writeMarker(() => {
      if (!opened || token !== generation || baseline !== markerBaseline || JSON.stringify(markerDraft) !== JSON.stringify(confirmed)) return { ok: false, error: 'The marker draft changed while waiting. Review it and try again.' };
      return markerPreflight() ? suite.playheadMarker.save(confirmed) : { ok: false, error: markerStatus.textContent };
    }); } catch { result = { ok: false, error: 'The marker could not be saved. Keep your draft and try again.' }; }
    finally { markerSaving = false; renderMarker(); }
    if (!opened || token !== generation) return;
    if (result.ok) { resetMarker(); markerStatus.textContent = 'Playback marker saved. No reload needed.'; }
    else markerWriteFailure(result);
  });
  markerRemove.addEventListener('click', async event => {
    if (!event.isTrusted || !opened || markerSaving || markerRemove.disabled) return;
    const token = generation, baseline = markerBaseline;
    markerSaving = true; renderMarker();
    let result;
    try { result = await writeMarker(() => {
      if (!opened || token !== generation || baseline !== markerBaseline) return { ok: false, error: 'The marker draft changed while waiting. Review it and try again.' };
      return markerPreflight() ? suite.playheadMarker.remove() : { ok: false, error: markerStatus.textContent };
    }); } catch { result = { ok: false, error: 'The marker could not be removed. Review the saved marker and try again.' }; }
    finally { markerSaving = false; renderMarker(); }
    if (!opened || token !== generation) return;
    if (result.ok) { ++generation; resetMarker(); markerStatus.textContent = 'The native red playback dot is restored.'; }
    else markerWriteFailure(result);
  });

  const updates = make('section', 'updates'); updates.className = 'extra-settings';
  const updatesHeading = make('h3', 'updates-heading', 'Script updates');
  const updatesNote = make('p', null, 'The latest stable GitHub release is selected by default. Save a different source only if you trust its publisher. The check reads release metadata. Installation opens in Tampermonkey.');
  updatesNote.className = 'section-note';
  const sourceLabel = make('label', null, 'Release source URL'); sourceLabel.htmlFor = 'ytms-updates-source';
  const source = make('input', 'updates-source'); source.type = 'url'; source.maxLength = 2048; source.autocomplete = 'off'; source.spellcheck = false;
  const latest = make('p', 'updates-latest', 'Latest version: Not checked'); latest.className = 'section-note';
  const updateActions = make('div'); updateActions.className = 'extra-settings-controls';
  const check = button('updates-check', 'Check for updates');
  const saveSource = button('updates-save-source', 'Save release source');
  saveSource.disabled = true;
  let trustedSourceDraft = null;
  const renderSource = () => { saveSource.disabled = sourceSaving || trustedSourceDraft === null || trustedSourceDraft === sourceBaseline; };
  const install = make('a', 'updates-install', 'Install update'); install.className = 'text-button extension-link';
  install.target = '_blank'; install.rel = 'noopener noreferrer'; install.hidden = true;
  updateActions.append(saveSource, check, install);
  const updateStatus = make('p', 'updates-status'); updateStatus.className = 'section-note'; updateStatus.setAttribute('role', 'status');
  updates.append(updatesHeading, updatesNote, sourceLabel, source, latest, updateActions, updateStatus); find('section-credits').append(updates);
  function cancelUpdate() {
    ++updateGeneration; suite.updates.cancel(); updateResult = null; install.hidden = true; install.removeAttribute('href'); check.disabled = sourceSaving;
  }
  source.addEventListener('input', event => {
    cancelUpdate(); latest.textContent = 'Latest version: Not checked'; updateStatus.textContent = '';
    trustedSourceDraft = event.isTrusted ? source.value : null;
    renderSource();
  });
  saveSource.addEventListener('click', async event => {
    if (!event.isTrusted || !opened || sourceSaving || trustedSourceDraft === null || trustedSourceDraft !== source.value) return;
    const token = updateGeneration, confirmed = trustedSourceDraft, baseline = sourceBaseline;
    sourceSaving = true; renderSource(); check.disabled = true;
    let saved;
    try { saved = await writeSource(() => {
      if (!opened || token !== updateGeneration || trustedSourceDraft !== confirmed || source.value !== confirmed || sourceBaseline !== baseline) return { ok: false, error: 'The release source draft changed while waiting. Review it and try again.' };
      const current = suite.updates.readSource();
      if (!current.ok || current.url !== baseline) return { ok: false, error: 'The saved release source changed. Reopen settings before saving.' };
      return suite.updates.saveSource(confirmed);
    }); } catch { saved = { ok: false, error: 'The release source could not be saved. Keep your draft and try again.' }; }
    finally { sourceSaving = false; renderSource(); check.disabled = false; }
    if (!opened || token !== updateGeneration) return;
    if (!saved.ok) { updateStatus.textContent = saved.conflict ? 'The release source is still synchronising or changed in another window. Keep your draft and try again.' : saved.error; return; }
    source.value = sourceBaseline = saved.url;
    trustedSourceDraft = null; saveSource.disabled = true;
    updateStatus.textContent = saved.url ? `Release source saved. Checks use ${new URL(saved.url).host}.` : 'Release source cleared.';
  });
  check.addEventListener('click', async event => {
    if (!event.isTrusted || !opened || sourceSaving) return;
    cancelUpdate();
    latest.textContent = 'Latest version: Not checked';
    if (source.value !== sourceBaseline) { updateStatus.textContent = 'Save the edited release source before checking.'; return; }
    const token = updateGeneration; check.disabled = true; updateStatus.textContent = 'Checking for updates…';
    const result = await suite.updates.check();
    if (!opened || token !== updateGeneration) return;
    check.disabled = false;
    if (!result.ok) { updateStatus.textContent = result.error; return; }
    updateResult = result; latest.textContent = `Latest version: ${result.latestVersion}`;
    const url = suite.updates.installationUrl(result);
    if (url) { install.href = url; install.hidden = false; install.textContent = `Install update from ${new URL(url).host}`; }
    updateStatus.textContent = result.status === 'newer' ? 'An update is available. Complete installation in Tampermonkey, then reload YouTube.' :
      result.status === 'older' ? 'Your installed version is newer than this release source.' : 'You have the latest version from this source.';
  });
  const validateInstall = event => {
    const url = suite.updates.installationUrl(updateResult);
    if (!event.isTrusted || !url) { event.preventDefault(); cancelUpdate(); updateStatus.textContent = 'Check for updates again before installing.'; }
    else install.href = url;
  };
  install.addEventListener('click', validateInstall);
  install.addEventListener('auxclick', validateInstall);
  install.addEventListener('contextmenu', validateInstall);
  function sourceChanged(event) {
    if (event.key !== null && event.key !== suite.updates.key) return;
    const hasDraft = source.value !== sourceBaseline;
    cancelUpdate(); latest.textContent = 'Latest version: Not checked';
    const result = suite.updates.readSource();
    if (!hasDraft && result.ok) source.value = result.url;
    sourceBaseline = result.ok ? result.url : '';
    trustedSourceDraft = null; saveSource.disabled = true;
    updateStatus.textContent = result.ok ? 'The release source changed in another window. Check again before installing.' : result.error;
  }
  for (const section of [marker, updates]) {
    section.addEventListener('input', event => event.stopPropagation());
    section.addEventListener('change', event => event.stopPropagation());
  }
  return {
    draftCategories: () => opened ? [
      (markerPreparing || markerChanged && JSON.stringify(markerDraft) !== markerBaseline) && 'playback marker edits',
      source.value !== sourceBaseline && 'release source edits',
    ].filter(Boolean) : [],
    savingCategories: () => [markerSaving && 'playback marker', sourceSaving && 'release source'].filter(Boolean),
    open() {
      opened = true; ++generation; resetMarker(); cancelUpdate();
      const result = suite.updates.readSource(); source.value = sourceBaseline = result.ok ? result.url : '';
      trustedSourceDraft = null; saveSource.disabled = true;
      unsubscribeStorage?.();
      if (suite.storage?.subscribe) unsubscribeStorage = suite.storage.subscribe(sourceChanged);
      else {
        window.addEventListener('storage', sourceChanged);
        unsubscribeStorage = () => window.removeEventListener('storage', sourceChanged);
      }
      updateStatus.textContent = result.ok ? '' : result.error; latest.textContent = 'Latest version: Not checked';
    },
    close() { opened = false; ++generation; cancelUpdate(); unsubscribeStorage?.(); unsubscribeStorage = null; markerDraft = null; markerPreparing = false; file.value = ''; preview.removeAttribute('src'); },
    selectTab(id) { if (id !== 'credits') { cancelUpdate(); if (updateStatus.textContent === 'Checking for updates…') updateStatus.textContent = ''; } },
  };
}
