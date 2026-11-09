// Language: en-GB. Scope private persistence without reading container names.
export function scopeStorageApis({ info, getValue, setValue, addValueChangeListener, removeValueChangeListener }) {
  const fail = () => { throw new Error('Tampermonkey browsing context is unavailable or incompatible. Existing settings were left unchanged.'); };
  let incognito, containerId = '';
  try {
    if (!info || typeof info !== 'object' || Array.isArray(info)) fail();
    incognito = info.isIncognito;
    if (typeof incognito !== 'boolean') fail();
    const container = info.container;
    if (container !== undefined) {
      if (!container || typeof container !== 'object' || Array.isArray(container)) fail();
      containerId = container.id;
      if (typeof containerId !== 'string' || !containerId.length || containerId.length > 128 ||
          /[\u0000-\u0020\u007f]/.test(containerId)) fail();
    }
    if (containerId === 'firefox-private' && !incognito) fail();
    if (containerId === 'firefox-default' || (incognito && containerId === 'firefox-private')) containerId = '';
    containerId = encodeURIComponent(containerId);
  } catch { fail(); }
  if ([getValue, setValue, addValueChangeListener, removeValueChangeListener].some(api => typeof api !== 'function')) fail();
  const prefix = !incognito && !containerId ? '' :
    `yt-master-suite.context.v1:${incognito ? 'private' : 'normal'}:${containerId ? `container:${containerId}` : 'default'}:`;
  function scopedKey(key) {
    if (typeof key !== 'string' || !key.length || key.startsWith('yt-master-suite.context.v1:')) fail();
    return prefix + key;
  }
  return Object.freeze({
    getValue(key, fallback) { return getValue(scopedKey(key), fallback); },
    setValue(key, value) { return setValue(scopedKey(key), value); },
    addValueChangeListener(key, callback) {
      if (typeof callback !== 'function') fail();
      const backendKey = scopedKey(key);
      return addValueChangeListener(backendKey, (changedKey, oldValue, newValue, remote) => {
        if (changedKey === backendKey) callback(key, oldValue, newValue, remote);
      });
    },
    removeValueChangeListener(id) { return removeValueChangeListener(id); },
  });
}
