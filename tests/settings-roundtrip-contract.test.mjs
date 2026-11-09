// Language: en-GB. Each saved preference survives a fresh settings instance and export.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSuiteSettings } from '../sources/suite-settings.mjs';
import { createFeatureCatalogue } from '../sources/feature-catalogue.mjs';
import { createMenuLayout } from '../sources/menu-layout.mjs';
import { createSuiteBackup } from '../sources/suite-backup.mjs';
import { createChannelAgeService } from '../sources/channel-age.mjs';

const defaults = createSuiteSettings(()=>null,()=>true).defaults;
const choices = {
  ...Object.fromEntries(createFeatureCatalogue().definitions.filter(item=>item.options).map(item=>[item.key,item.options.map(([value])=>value)])),
  colourMode:['default','preset','custom','off'], palette:['teal-coral','lavender-gold','cyan-rose'],
  watchedThreshold:['5','10','25','50','75','80','90','95','100'], wheelStep:['1','2','5','10'],
  preferredVideoQuality:['off','highest','tiny','small','medium','large','hd720','hd1080','hd1440','hd2160'],
  timelinePreviewSize:['auto','small','medium','large','native'], timeDisplayMode:['native','elapsed','remaining'],
  corner:['top-right','bottom-right','bottom-left','top-left'], miniplayerSizeMode:['auto','custom'],
  headerSettingsIcon:['off','colour','monochrome'], playerSettingsIcon:['off','colour','monochrome'],
  miniplayerWidth:[320,721,1200], viewerColour:['#A1B2C3'], ownerColour:['#123ABC'],
  menuItemOrder:[[...defaults.menuItemOrder].reverse()], menuLayout:[createMenuLayout().fromPreferences({})],
};

for(const [key,fallback] of Object.entries(defaults)) test(`saved setting ${key} survives all declared choices without losing unrelated preferences`,()=>{
  const candidates=typeof fallback==='boolean'?[false,true]:choices[key];
  assert.ok(candidates?.length,`Missing contract cases for ${key}`);
  for(const value of candidates){
    const data=new Map();
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
    const settings=createSuiteSettings(()=>storage,()=>true);
    const sentinel=key==='viewerColour'?'ownerColour':'viewerColour';
    const input={...settings.defaults,[sentinel]:'#112233',[key]:value};
    const result=settings.save(input);
    assert.equal(result.ok,true,`${key}: ${result.error}`);
    assert.deepEqual(JSON.parse(data.get(settings.key)).values[key],value,`${key}: stored value`);
    const before=new Map(data),fresh=createSuiteSettings(()=>storage,()=>true);
    assert.deepEqual(fresh.initial[key],value,`${key}: fresh instance`);
    assert.equal(fresh.initial[sentinel],'#112233',`${key}: unrelated preference`);
    assert.deepEqual(data,before,`${key}: reading must not write`);
    const backup=createSuiteBackup(()=>storage,fresh,createChannelAgeService(()=>storage));
    const exported=backup.exportData();
    assert.equal(exported.ok,true,`${key}: export`);
    assert.deepEqual(JSON.parse(exported.text).settings[key],value,`${key}: backup value`);
    assert.equal(backup.preview(exported.text).ok,true,`${key}: import validation`);
  }
});
