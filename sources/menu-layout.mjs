// Language: en-GB. Self-contained, data-only menu layout rules embedded by the builder.
// Labels never become selectors, URLs, HTML, CSS or executable commands.
export function createMenuLayout() {
  const actionIds = Object.freeze(['playNext', 'addToQueue', 'watchLater', 'savePlaylist', 'download', 'share',
    'notInterested', 'channelAge', 'dontRecommend', 'report']);
  const labels = Object.freeze({ playNext: 'Play next in queue', addToQueue: 'Add to queue', watchLater: 'Save to Watch Later',
    savePlaylist: 'Save to playlist', download: 'Download', share: 'Share', notInterested: 'Not interested',
    channelAge: 'Filter channel uploads', dontRecommend: 'Don’t recommend channel', report: 'Report' });
  const limits = Object.freeze({ maxGroups: 8, maxDepth: 3, maxNameLength: 40 });
  const groupId = value => value === 'channelTools' || /^submenu-[a-z0-9-]{1,24}$/.test(value);
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
  function fields(value, expected) {
    if (!plain(value) || Reflect.ownKeys(value).length !== expected.length) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return expected.every(name => Object.hasOwn(descriptors, name) && Object.hasOwn(descriptors[name], 'value') && descriptors[name].enumerable);
  }
  function clone(value) {
    return value === null ? null : { version: 1, nodes: value.nodes.map(node => actionIds.includes(node.id)
      ? { id: node.id, parent: node.parent, visible: node.visible }
      : { id: node.id, name: node.name, parent: node.parent }) };
  }
  function validate(value) {
    try {
      if (!fields(value, ['version', 'nodes']) || value.version !== 1 || !Array.isArray(value.nodes) ||
          Object.getPrototypeOf(value.nodes) !== Array.prototype || value.nodes.length < actionIds.length ||
          value.nodes.length > actionIds.length + limits.maxGroups ||
          Reflect.ownKeys(value.nodes).length !== value.nodes.length + 1) return null;
      const nodes = new Map();
      let groupCount = 0;
      for (let index = 0; index < value.nodes.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value.nodes, index);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
        const node = descriptor.value;
        if (!plain(node)) return null;
        const id = Object.getOwnPropertyDescriptor(node, 'id');
        const parent = Object.getOwnPropertyDescriptor(node, 'parent');
        if (!id || !Object.hasOwn(id, 'value') || typeof id.value !== 'string' || nodes.has(id.value) ||
            !parent || !Object.hasOwn(parent, 'value') || typeof parent.value !== 'string') return null;
        if (actionIds.includes(node.id)) {
          if (!fields(node, ['id', 'parent', 'visible']) || typeof node.visible !== 'boolean') return null;
        } else {
          if (!fields(node, ['id', 'name', 'parent']) || !groupId(node.id) || typeof node.name !== 'string' ||
              node.name !== node.name.trim() || !node.name.length || node.name.length > limits.maxNameLength ||
              /[\u0000-\u001f\u007f-\u009f<>\u2028\u2029]/.test(node.name) || ++groupCount > limits.maxGroups) return null;
        }
        nodes.set(node.id, node);
      }
      if (actionIds.some(id => !nodes.has(id))) return null;
      for (const node of nodes.values()) {
        const visited = new Set([node.id]);
        let parent = node.parent, depth = actionIds.includes(node.id) ? 0 : 1;
        while (parent !== 'root') {
          const owner = nodes.get(parent);
          if (!owner || actionIds.includes(parent) || visited.has(parent) || ++depth > limits.maxDepth) return null;
          visited.add(parent); parent = owner.parent;
        }
      }
      return clone(value);
    } catch { return null; }
  }
  function fromPreferences(preferences = {}) {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
    const custom = validate(preferences.menuLayout);
    if (custom) return custom;
    const grouped = preferences.menuGroupChannelTools !== false;
    const defaultOrder = [...actionIds, 'channelTools'];
    const requested = Array.isArray(preferences.menuItemOrder) ? preferences.menuItemOrder : [];
    const order = [...new Set([...requested.filter(id => defaultOrder.includes(id)), ...defaultOrder])];
    const visibility = { download: preferences.menuShowDownload === true, channelAge: preferences.menuShowAgeLimit !== false,
      notInterested: preferences.menuShowNotInterested !== false, dontRecommend: preferences.menuShowDontRecommend !== false,
      report: preferences.menuShowReport !== false };
    return { version: 1, nodes: order.flatMap(id => id === 'channelTools'
      ? grouped ? [{ id, name: 'Channel tools', parent: 'root' }] : []
      : [{ id, parent: grouped && ['channelAge', 'dontRecommend', 'report'].includes(id) ? 'channelTools' : 'root',
        visible: Object.hasOwn(visibility, id) ? visibility[id] : true }]) };
  }
  return Object.freeze({ actionIds, labels, limits, validate, fromPreferences, clone });
}
