---
lang: en-GB
---

<p align="center">
  <img src="assets/YouTube_Master_Suite_Logo.svg" width="512" height="512" alt="YouTube Master Suite logo">
</p>

# YouTube Master Suite

One Tampermonkey userscript for cleaner YouTube feeds, better playback controls
and a more useful queue.

[Install](#installation) · [Settings](#suite-settings) · [Optional controls](FEATURES.md) ·
[Channel filters](#channel-upload-filters) · [Help](#troubleshooting) ·
[Technical reference](docs/technical-reference.md)

## What it does

| Area | Features |
| --- | --- |
| Playback | Toggle live chat, mirror videos, adjust volume with right-click + wheel, choose a preferred starting quality and customise captions. |
| Queue | Play next in queue, one-step up/down controls, improved native dragging and clearer queue labels. |
| Feeds | Hide watched videos, Shorts and other unwanted cards; set upload-age limits for individual channels. |
| Comments | Reduce clutter, distinguish creator names and guard against stale comments after video changes. |
| Layout | Wider watch-page content, a floating scroll miniplayer and optional fullscreen-strip hiding. |
| Menus | Create named, nested submenus; arrange or hide recognised actions; choose collaboration creators; and explicitly look up missing channel IDs. |
| Consent | Reject optional cookies through YouTube's visible **Reject all** action on supported consent screens. |

Eight feature modules share common browser infrastructure. The Suite
uses YouTube's native playback and queue rather than maintaining replacements.

Optional settings include **Feed → Keep hover previews with miniplayer** and
**Player → Playback time display** (elapsed or remaining). Both preserve YouTube's
behaviour by default. Hover previews are experimental and honour YouTube's own
Inline playback preference; unsupported layouts remain unchanged.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) and follow its
   browser-specific setup instructions.
2. Open this repository's **Releases** page, download `youtube-master-suite.user.js`
   from the latest release, and approve installation. No GitHub sign-in is needed.
3. Disable any old standalone Suite component scripts, including **YouTube
   SponsorBlock Queue Width**, to avoid duplicate controls and processing.
   Leave companion extensions such as SponsorBlock enabled.
4. Reload YouTube to start the Suite. This restarts the current video.

If the file downloads instead of opening an installation prompt, paste its
complete contents into Tampermonkey's script editor and save. When updating,
replace the existing **YouTube Master Suite** script rather than adding a copy.

## Suite settings

Open the Suite logo beside your profile picture or in the player controls.
Settings are saved in Tampermonkey's private storage for this script, rather than
YouTube's `localStorage`. They are not synchronised through your Google account.
The Suite does not enable browser or cloud synchronisation; any separately
configured Tampermonkey synchronisation remains a userscript-manager setting.

- Edit your preferences, then select **Save**. Returning a setting to its saved
  value removes that unsaved change.
- Most changes take effect after reloading. **Reload now** restarts the current
  video; saving alone does not reload it.
- **Cancel** discards unsaved changes. **Restore this section** and **Restore all
  settings** change the draft until you save; they do not delete channel filters.
- Channel upload filters have their own **Save filters** button and apply
  immediately, without reloading.

Useful starting points:

| Setting | Where to find it |
| --- | --- |
| Show the live chat button | **Player** — opens the existing chat in a floating panel when available, including YouTube's page fullscreen. |
| Hide the extra fullscreen action strip | **Player** — off by default; the main playback bar stays unchanged. |
| Preferred starting video quality | **Player** — YouTube chooses by default; later manual choices remain yours. |
| Timeline hover-preview size | **Player** — automatic by default; chosen sizes scale down with the scroll miniplayer. |
| Picture instead of the red playback dot | **Player → Playback marker image** — choose a local PNG, JPEG or WebP, then Save image. Restore red dot removes it. |
| Floating player size | **Miniplayer** — keep Automatic or choose a custom width. Changes preview immediately; Save keeps them and Cancel restores the saved size. |
| Watched-video threshold | **Feed** — choose how much counts as watched. |
| Hide live or scheduled videos | **Feed** — live videos are visible by default; upcoming streams and premieres remain hidden by default. Control each separately. |
| Group, hide or reorder menu actions | **Interface → Video context menu** — the settings group starts collapsed. Download is hidden by default. |
| View, edit or remove channel rules | **Channels → Channel upload filters**. |
| Extension-icon visibility | **Interface** — control DeArrow icons and the Return YouTube Dislike tooltip bar separately. |

The live chat button does not change saved preferences. **Layout → Hide live chat
by default** sets the starting state for each video. Toggling preserves the chat
iframe and typed draft; player-only fullscreen leaves the button unavailable.
In standard and theatre views with enough room, chat keeps its space beside the
video without reserving an empty column beside descriptions or comments.
Visible queues, SponsorBlock widgets and native panels keep their space. Narrow
windows and native fullscreen retain the floating overlay.

## Channel upload filters

Keep recent uploads from news or daily channels without hiding their new videos.

1. Open **Settings → Channels**, or choose **Filter channel uploads** in a
   supported video's menu to open the same screen with that channel selected.
2. Use the channel's `UC…` ID or full `youtube.com/channel/UC…` URL, not its
   `@handle`. Add a recognisable name.
3. Set a maximum age in **days, weeks, months or years**, or choose **Hide this
   channel — all uploads**.
4. Use **Add filter** / **Update filter** to collapse an entry, or **Add another
   channel** to create another. Select **Save filters** to apply the list.

The **Channels** tab lists saved rules with **Edit** and **Remove** buttons in an
Actions column. Search by name or channel ID, or sort the view without changing
the saved order. Each rule can also be disabled without deleting it.

Use **Import or export channels** to save just the channel list and its limits.
Import previews changes first: **Merge** keeps unlisted channels; **Replace**
replaces the list after confirmation. Other settings are left unchanged.

Saving returns to the table when entered through settings, or closes settings
when entered from a video menu. Failed saves keep the editor and its draft open.

Saving from a supported feed card replaces that card with a confirmation showing
the timeframe, plus **Undo** and **Edit filter**. Other matching cards are hidden.

Filters affect supported Home, Search, Subscriptions and channel video cards.
They leave **Watch History, queues, saved playlists and directly opened videos**
unchanged. Age-only rules keep live/upcoming videos and uploads whose dates
cannot reliably establish their age; whole-channel rules also hide those cards.

Watched-video filtering remains separate. These rules neither import nor change
YouTube's own **Don't recommend channel** choices. **Filtered · Show** temporarily
reveals filtered cards without exposing advertisements.

## Play next in queue

Choose **Play next in queue** above **Add to queue** in a supported video menu.
An existing queued video is moved, not duplicated; choosing the playing video
does nothing. Saved playlists are not reordered.

YouTube's native add and reorder actions are separate. A new video can briefly
appear at the end before moving. If an error says the video was added but could
not be moved, **check the queue before retrying**. If the queue is still updating,
the Suite closes the menu without adding it; reopen the menu once it is ready.

Supported queues show **up/down arrows** above and below the drag
handle when you hover over a row or focus an arrow with the keyboard. Each click
moves one place; dragging still works. Arrows are disabled at the ends and while
a move is pending. Saved playlists are left unchanged.

Queue titles use at most two lines. Hover over a truncated title to read it in a
small floating tooltip; keyboard focus also reveals it. The tooltip never expands
the row.

## Updates

**Updates are manual.** In **Credits → Script updates**, the latest stable GitHub
release is selected by default. Choose **Check for updates** without entering a
URL. You can use a different public GitHub Releases page or an HTTPS
`release-manifest.json` URL; clearing it restores the default. If a newer release
is available, **Install update** opens its userscript
in Tampermonkey. Complete installation there and reload YouTube when convenient.
You can also download the script from this repository's **Releases** page.

Checks read release metadata only and run when requested. The chosen release
source stays in the current browser profile. Publishing a release does not update
an installed copy automatically.

Use release assets rather than development copies from `main`. Install and
update the script separately in each browser profile where you use it.

## Companion extensions

The Suite includes compatibility options for **SponsorBlock**, **DeArrow** and
**Return YouTube Dislike**. **Extensions** in settings also lists uBlock Origin,
with descriptions and official links.

These recommendations do not detect, install or enable extensions. Independent
uBlock cosmetic filters can still hide elements even when a Suite setting shows
them. DeArrow's title and thumbnail replacements are independent of the Suite's
icon-visibility settings.

## Backup and support

Open **Support → Full backup and restore** in settings to:

- **Download a backup** of saved preferences and channel filters. Backups include
  channel names and IDs; keep them private. Unsaved drafts are not included.
- **Restore a backup** after previewing and confirming it. Restore **replaces**
  the saved settings and entire filter list; it does not merge them.
- **Copy a support report** containing the loaded version, module status and
  limited diagnostics, without video/channel IDs, titles or account details.

These tools do not upload backups or reports. Copying a report writes to the
clipboard only when requested. Restoring does not automatically reload the page.
Personal playback-marker images and the locally chosen update source are excluded
from general settings backups and support reports.

### Storage migration and rollback

On the first upgraded run, the Suite copies the exact five existing records:
preferences, miniplayer corner, channel rules, playback-marker image and update
source. It preserves a migration snapshot in Tampermonkey storage. Subsequent
saves use private records and are not mirrored back into YouTube storage. Missing
storage permissions or a failed migration do not silently switch new saves back
to YouTube storage.

First migration uses a Web Lock and one page-visible coordination flag containing
only the constant `1`. A tab with a delayed Tampermonkey cache waits for the
private migration record instead of copying stale settings over it. This flag
contains no settings. If migration is interrupted and the private record never
arrives, startup stops visibly; it does not clear the guard and guess that retrying
is safe. The existing site records remain available for rollback.

If the storage notice remains after a reload, restore the saved v1.2.64 script
to use the preserved older settings. Reinstalling v1.2.65 alone does not reset a
retained migration guard. If Tampermonkey's protected records were deleted,
recovering settings saved after migration requires an existing personal export
or Tampermonkey backup containing those settings. Keep the existing YouTube site
data and migration guard intact while recovering.

Private-window and Firefox container records use separate Tampermonkey keys,
based on the browsing-context information supplied by Tampermonkey. Container
names are not read or stored. These preferences persist in Tampermonkey storage;
closing a private window does not itself erase the protected records.

The original records remain untouched as a temporary historical rollback copy.
They are still readable by scripts running on YouTube until a separately
confirmed cleanup removes them. Already-open tabs retain the old script until
reloaded and can still change those legacy records; the preserved snapshot is
not a backup of later changes. Keep personal exports and rollback data private.

The Suite requests only four storage APIs and retains `@sandbox raw` so native
YouTube player and queue objects remain accessible. This separates persistent
records from YouTube's origin storage; it is not isolation from hostile code
running in the page. The Suite does not expose a general storage bridge to page
scripts. Values rendered into the page, including the chosen playback image,
remain visible to page code. See Tampermonkey's
[storage API](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_values)
and [sandbox documentation](https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox).

## Troubleshooting

- **An update or setting seems unchanged:** reload YouTube when ready. Replacing
  the script does not update an already-open page.
- **Controls appear twice:** keep only one Suite installation enabled and disable
  its superseded standalone component scripts.
- **A channel filter misses a video:** check the saved channel ID, enabled state
  and applicable page. Uncertain dates stay visible for age-only rules.
- **A menu or queue action fails:** read its status message before retrying.
  Unsupported or ambiguous native interfaces are left alone.
- **Still a problem:** copy a report from **Support** and open an issue on this
  repository's **Issues** page, including the affected feature and steps to
  reproduce it.

The Suite targets desktop `www.youtube.com`; only the cookie-consent handler
runs on `consent.youtube.com`. It does not run in frames. YouTube layout
experiments can require updates: automated regression checks cannot guarantee
compatibility with every live layout or extension combination.

Tampermonkey builds for Chrome, Edge, Firefox and Safari are the compatibility
targets; Zen uses Firefox extensions. Support is not verified merely because a
browser can run the script: browser-engine fixtures do not establish real
Tampermonkey migration, persistence or native YouTube compatibility. Safari
requires checks in an actual Safari installation. Sandbox fallbacks and browser
or extension updates can change which native interfaces are available.
Safe first migration requires Web Locks (Chrome 69+, Firefox 96+, Safari 15.4+)
and Tampermonkey browsing-context metadata. An existing migration can load without
Web Locks. These are capability requirements, not a claim that every browser,
private-session or container configuration has been tested.

## Development

Build commands, testing, runtime diagnostics and the connected-editor workflow
are in the [technical reference](docs/technical-reference.md). Canonical module
versions are recorded in [sources.lock.json](sources.lock.json).

## Licence

The userscript is published under [GNU GPLv3](LICENSE). Bundled artwork includes
[third-party notices](assets/recommended-extensions.NOTICE.txt).
