// Language: en-GB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeatureCatalogue } from '../sources/feature-catalogue.mjs';
import { createSuiteSettings } from '../sources/suite-settings.mjs';
import { createSuiteBackup } from '../sources/suite-backup.mjs';
import { createChannelAgeService } from '../sources/channel-age.mjs';

function fixture(values) {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  if (values) data.set('yt-master-suite.settings.v1', JSON.stringify({ version: 1, values }));
  const settings = createSuiteSettings(() => storage, () => true);
  return { data, storage, settings, backup: createSuiteBackup(() => storage, settings, createChannelAgeService(() => storage)) };
}

test('retired Home loading and film preferences migrate without rewriting storage or losing settings', () => {
  for (const hideFeedMovies of [true, false]) {
    const f = fixture({ autoLoadFilteredHome: true, showHomeLoadMore: true, homeLoadBatchLimit: '5', homeLoadDelay: '3', hideFeedMovies, miniplayerWidth: 997, viewerColour: '#ABCDEF' });
    const before = f.storage.getItem(f.settings.key);
    assert.equal(f.settings.initial.filmVisibility, hideFeedMovies ? 'none' : 'free');
    assert.equal(f.storage.getItem(f.settings.key), before);
    const exported = f.backup.exportData();
    assert.equal(exported.ok, true, exported.error);
    const doc = JSON.parse(exported.text);
    assert.equal(doc.settings.filmVisibility, hideFeedMovies ? 'none' : 'free');
    assert.equal(doc.settings.miniplayerWidth, 997);
    delete doc.settings.filmVisibility;
    Object.assign(doc.settings, { hideFeedMovies, autoLoadFilteredHome: true, showHomeLoadMore: false, homeLoadBatchLimit: '10', homeLoadDelay: '5' });
    assert.equal(f.backup.preview(JSON.stringify(doc)).ok, true);
    assert.equal(f.settings.save(f.settings.read()).ok, true);
    const saved = JSON.parse(f.storage.getItem(f.settings.key)).values;
    for (const name of ['hideFeedMovies','autoLoadFilteredHome','showHomeLoadMore','homeLoadBatchLimit','homeLoadDelay']) assert.equal(Object.hasOwn(saved, name), false);
    assert.equal(saved.filmVisibility, hideFeedMovies ? 'none' : 'free');
    assert.equal(saved.viewerColour, '#ABCDEF');
  }
});

test('migration still protects malformed and unknown saved preferences', () => {
  for (const values of [{autoLoadFilteredHome:'yes'}, {homeLoadBatchLimit:'999'}, {hideFeedMovies:true,showFilms:true}, {unknownPreference:true}]) {
    const f = fixture(values), before = f.storage.getItem(f.settings.key);
    assert.equal(f.settings.save(f.settings.read()).ok, false);
    assert.equal(f.backup.exportData().ok, false);
    assert.equal(f.storage.getItem(f.settings.key), before);
  }
  const f = fixture(), doc = JSON.parse(f.backup.exportData().text);
  doc.settings.homeLoadDelay = '0';
  assert.equal(f.backup.preview(JSON.stringify(doc)).ok, false);
});

test('boolean film settings migrate with the prior paid-content preference and all four choices round-trip', () => {
  for (const [values, expected] of [
    [{showFilms:true,hidePayToWatchCards:true},'free'],
    [{showFilms:true,hidePayToWatchCards:false},'all'],
    [{showFilms:false,hidePayToWatchCards:false},'none'],
    [{hideFeedMovies:false,hidePayToWatchCards:false},'all'],
    [{hidePayToWatchCards:false},'all'],
  ]) {
    const f=fixture(values), before=f.storage.getItem(f.settings.key);
    assert.equal(f.settings.initial.filmVisibility,expected);
    assert.equal(f.storage.getItem(f.settings.key),before);
    assert.equal(f.backup.exportData().ok,true);
    assert.equal(f.settings.save(f.settings.read()).ok,true);
  }
  for (const filmVisibility of ['all','free','paid','none']) {
    const f=fixture({filmVisibility});
    assert.equal(f.settings.initial.filmVisibility,filmVisibility);
    const doc=JSON.parse(f.backup.exportData().text);
    assert.equal(doc.settings.filmVisibility,filmVisibility);
    assert.equal(f.backup.preview(JSON.stringify(doc)).ok,true);
  }
});

test('catalogue has unique, typed settings and rejects arbitrary option values', () => {
  const catalogue = createFeatureCatalogue(), { settings } = fixture();
  assert.equal(new Set(catalogue.definitions.map(item => item.key)).size, catalogue.definitions.length);
  for (const item of catalogue.definitions) {
    assert.ok(item.label && item.description && item.section);
    assert.ok(['feed', 'player', 'layout', 'interface', 'comments', 'miniplayer'].includes(item.tab));
    assert.equal(settings.validate({ [item.key]: 'url(javascript:invalid)' })[item.key], item.default);
    if (item.options) for (const [value] of item.options) assert.equal(settings.validate({ [item.key]: value })[item.key], value);
  }
  assert.ok(JSON.stringify({ version: 1, values: settings.defaults }).length < 8192);
});

test('new controls preserve old saved values and reading never rewrites the record', () => {
  const f = fixture({ viewerColour: '#ABCDEF', hideChat: false, miniplayerWidth: 997, showDeArrowQueueButton: false });
  const before = f.storage.getItem(f.settings.key);
  assert.equal(f.settings.initial.viewerColour, '#ABCDEF');
  assert.equal(f.settings.initial.hideChat, false);
  assert.equal(f.settings.initial.miniplayerWidth, 997);
  assert.equal(f.settings.initial.showDeArrowQueueButton, false);
  for (const key of ['originalAudio', 'snapshotButton', 'homeRedirect', 'hideAllComments', 'fullWindowTheatre']) assert.equal(f.settings.initial[key], false);
  assert.equal(f.storage.getItem(f.settings.key), before);
});

test('earlier full backups gain only defaults for newly introduced controls', () => {
  const f = fixture();
  const exported = f.backup.exportData(); assert.equal(exported.ok, true);
  const old = JSON.parse(exported.text);
  for (const feature of f.settings.features) delete old.settings[feature.key];
  old.settings.viewerColour = '#ABCDEF';
  const restored = f.backup.preview(JSON.stringify(old));
  assert.equal(restored.ok, true, restored.error);
  const invalid = JSON.parse(exported.text); invalid.settings.originalAudio = 'yes';
  assert.equal(f.backup.preview(JSON.stringify(invalid)).ok, false);
});

test('opposing presentation preferences resolve consistently without modifying the running snapshot', () => {
  const f = fixture();
  const result = f.settings.save({ ...f.settings.defaults, relatedBelowPlayer: true, hideRelated: true,
    disableVideoPreviews: true, keepHoverPreviews: true, hideAllComments: true, fullscreenComments: true });
  assert.equal(result.ok, true);
  assert.equal(result.values.hideRelated, false);
  assert.equal(result.values.keepHoverPreviews, false);
  assert.equal(result.values.fullscreenComments, false);
  assert.equal(f.settings.initial.hideRelated, true);
  assert.equal(f.settings.initial.hideAllComments, false);
});

test('new controls reach existing native cleanup flags instead of competing with them', () => {
  const f = fixture({ redirectShorts: false, hideMerchandise: false, hideVideoMetadata: false,
    hideInfoPanels: false, hideAskPanels: false, hideShareButton: false, restoreMiniplayerButton: false, collapseEmptySidebar: false });
  const config = f.settings.overrides('playerPreferencesLite', { feedFilterProfiles: {} });
  for (const key of ['convertShortsToWatch', 'hideMerchShelf', 'hideMetadataTeaserCarousel', 'hideInfoPanel', 'hideAskButton', 'hideShareButton']) assert.equal(config[key], false, key);
  assert.equal(f.settings.overrides('miniplayerButtonRestorer', {}).enabled, false);
  assert.equal(f.settings.overrides('watchLayoutCleaner', {}).collapseEmptySidebar, false);
});

test('native queue fitting defaults on independently of Suite floating-player sizing and remains cancellable through saved preferences', () => {
  const f = fixture({ miniplayerEnabled: false, miniplayerSizeMode: 'custom', miniplayerWidth: 997 });
  assert.equal(f.settings.initial.compactNativeQueue, true);
  assert.equal(f.settings.save({ ...f.settings.read(), compactNativeQueue: false }).ok, true);
  assert.equal(f.settings.initial.compactNativeQueue, true);
  assert.equal(f.settings.read().compactNativeQueue, false);
  assert.equal(f.settings.read().miniplayerWidth, 997);
  assert.equal(f.settings.read().miniplayerEnabled, false);
});
