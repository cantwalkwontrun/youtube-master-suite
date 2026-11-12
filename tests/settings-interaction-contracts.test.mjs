// Language: en-GB. Directed interactions at the validated-settings/module boundary.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSuiteSettings } from '../sources/suite-settings.mjs';

function configured(values) {
  const raw = JSON.stringify({ version: 1, values });
  return createSuiteSettings(() => ({ getItem: key => key.endsWith('settings.v1') ? raw : null }), () => true);
}
const pairs = [[false, false], [false, true], [true, false], [true, true]];
const native = { feedFilterProfiles: { home: { payToWatchCards: false }, history: { watchedVideos: false } } };

for (const [hideAllComments, fullscreenComments] of pairs)
test(`comment visibility/fullscreen interaction reaches the runtime consistently: ${hideAllComments}/${fullscreenComments}`, () => {
  const settings = configured({ hideAllComments, fullscreenComments, wheelVolume: false });
  const runtime = settings.overrides('playerPreferencesLite', native);
  assert.equal(settings.initial.hideAllComments, hideAllComments);
  assert.equal(runtime.enableFullscreenComments, fullscreenComments && !hideAllComments);
  assert.equal(runtime.enablePlayerWheelVolume, false, 'An independent playback preference must survive resolution');
});

for (const [disableVideoPreviews, keepHoverPreviews] of pairs)
test(`preview policy interaction reaches the runtime consistently: ${disableVideoPreviews}/${keepHoverPreviews}`, () => {
  const settings = configured({ disableVideoPreviews, keepHoverPreviews, preferredVideoQuality: 'hd1080' });
  const runtime = settings.overrides('playerPreferencesLite', native);
  assert.equal(runtime.disableVideoPreviews, disableVideoPreviews);
  assert.equal(runtime.keepHoverPreviews, keepHoverPreviews && !disableVideoPreviews);
  assert.equal(runtime.preferredVideoQuality, 'hd1080');
});

for (const [relatedBelowPlayer, hideRelated] of pairs)
test(`related-video placement and hiding share a consistent rail contract: ${relatedBelowPlayer}/${hideRelated}`, () => {
  const settings = configured({ relatedBelowPlayer, hideRelated, collapseEmptySidebar: false });
  const player = settings.overrides('playerPreferencesLite', native);
  const rail = settings.overrides('watchLayoutCleaner', { relatedVideosHideBreakpointPx: 1420 });
  assert.equal(settings.initial.relatedBelowPlayer, relatedBelowPlayer);
  assert.equal(player.hideRelatedVideos, hideRelated && !relatedBelowPlayer);
  assert.equal(rail.relatedVideosHideBreakpointPx, hideRelated && !relatedBelowPlayer ? 1420 : 0);
  assert.equal(rail.collapseEmptySidebar, false);
});

for (const [hideWatchedVideos, hidePayToWatchCards] of pairs)
test(`feed filters retain their History exception and native profile fields: ${hideWatchedVideos}/${hidePayToWatchCards}`, () => {
  const config = { feedFilterProfiles: {
    home: { payToWatchCards: false, upcomingStreams: true },
    history: { payToWatchCards: false, watchedVideos: false, upcomingStreams: false },
    search: { customNativeFlag: true },
  } };
  const before = structuredClone(config);
  const runtime = configured({ hideWatchedVideos, hidePayToWatchCards }).overrides('playerPreferencesLite', config);
  assert.equal(runtime.feedFilterProfiles.home.watchedVideos, hideWatchedVideos);
  assert.equal(runtime.feedFilterProfiles.search.watchedVideos, hideWatchedVideos);
  assert.equal(runtime.feedFilterProfiles.history.watchedVideos, false);
  assert.equal(runtime.feedFilterProfiles.home.payToWatchCards, hidePayToWatchCards);
  assert.equal(runtime.feedFilterProfiles.history.payToWatchCards, hidePayToWatchCards);
  assert.equal(runtime.feedFilterProfiles.search.customNativeFlag, true);
  assert.equal(Object.hasOwn(runtime.feedFilterProfiles.search, 'payToWatchCards'), false);
  assert.deepEqual(config, before, 'Settings must not rewrite the native profile template');
});
