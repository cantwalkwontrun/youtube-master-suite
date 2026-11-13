// Language: en-GB. Catalogue, local validation and backup coverage; no profile storage.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeatureCatalogue } from '../sources/feature-catalogue.mjs';
import { createSuiteSettings } from '../sources/suite-settings.mjs';
import { createSuiteBackup } from '../sources/suite-backup.mjs';
import { createChannelAgeService } from '../sources/channel-age.mjs';
test('unique queue preference defaults on and states the queue behaviour and reload boundary',() => {
  const definition = createFeatureCatalogue().definitions.find(item => item.key === 'uniqueQueueVideos');
  assert.equal(definition.default,true); assert.equal(definition.tab,'miniplayer'); assert.equal(definition.section,'Native queue');
  assert.equal(definition.label,'Prevent duplicate queue videos');
  for (const text of ['one entry per video','end','after the current entry','playing entry is kept','Save and reload']) assert.ok(definition.description.includes(text));
});
test('unique queue opt-out validates and round-trips while old settings are read without writes',() => {
  const values = new Map([['yt-master-suite.settings.v1',JSON.stringify({version:1,values:{viewerColour:'#ABCDEF'}})]]);
  const storage = {getItem:key => values.get(key) ?? null,setItem:(key,value) => values.set(key,value),removeItem:key => values.delete(key)};
  const before = storage.getItem('yt-master-suite.settings.v1'), settings = createSuiteSettings(() => storage,() => true);
  assert.equal(settings.initial.uniqueQueueVideos,true); assert.equal(storage.getItem(settings.key),before);
  assert.equal(settings.save({...settings.read(),uniqueQueueVideos:false}).ok,true);
  assert.equal(settings.read().uniqueQueueVideos,false); assert.equal(settings.initial.uniqueQueueVideos,true);
  assert.equal(settings.read().viewerColour,'#ABCDEF');
  const backup = createSuiteBackup(() => storage,settings,createChannelAgeService(() => storage)), exported = backup.exportData();
  assert.equal(exported.ok,true); assert.equal(JSON.parse(exported.text).settings.uniqueQueueVideos,false);
  assert.equal(backup.preview(exported.text).ok,true);
});
