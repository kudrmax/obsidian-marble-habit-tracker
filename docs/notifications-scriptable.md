# System notifications through Scriptable

How a plugin gets real system notifications on Max's iPhone. Tried and working on 2026-10-27.

## Why not from the plugin

- Obsidian's plugin API has no notifications. On desktop the web `new Notification()` works because Obsidian runs in Electron; on iOS it doesn't (WKWebView), and `new Notice()` shows only while Obsidian is open.
- Mobile Obsidian is a Capacitor app, and plugins can reach `window.Capacitor.Plugins`, but Obsidian 1.15 registers only `App, Browser, CapacitorCookies, CapacitorHttp, Clipboard, Device, Filesystem, Haptics, InAppReview, KeepAwake, Keyboard, Preferences, SecureStorage, SplashScreen, StatusBar`: no `LocalNotifications`.
- iOS doesn't keep plugin code running in the background, so the plugin can't fire anything at a given time.

## The scheme

1. The plugin writes what to remind and when into a file in the vault.
2. [Scriptable](https://docs.scriptable.app/) (a native iOS app) runs a script that reads that file, removes the notifications it scheduled before and schedules the current ones as iOS local notifications (`Notification.setTriggerDate` + `schedule()`).
3. iOS delivers them itself, with Obsidian and Scriptable closed.
4. A Shortcuts automation "Obsidian is closed → Scriptable: Run Script" re-runs the script, so the queue follows the file every time Max leaves Obsidian.

Setup on the phone: Scriptable → Settings → File Bookmarks → the vault folder (On My iPhone → Obsidian → Obsidian), named `vault`; the script pasted as a new script; the automation in Shortcuts → Automation → App → Obsidian → Is Closed, Run Immediately.

## Example that was tried

The file is a note; each line is one notification:

```
- 2026-10-27 18:30 Позвонить маме
- +2 Тест через 2 минуты
```

`- YYYY-MM-DD HH:MM text` fires at that time; `- +N text` fires N minutes after the script runs (for testing: every run moves it again). Other lines are ignored.

```js
const BOOKMARK = "vault";
const NOTE = "Scriptable test.md";
const VAULT = "Obsidian";
const ID_PREFIX = "obsidian-";

const fm = FileManager.local();
const path = fm.joinPath(fm.bookmarkedPath(BOOKMARK), NOTE);
if (!fm.fileExists(path)) throw new Error("Не найден файл: " + path);
const text = fm.readString(path);

const pending = await Notification.allPending();
const oldIds = pending.map(n => n.identifier).filter(id => id.startsWith(ID_PREFIX));
if (oldIds.length) Notification.removePending(oldIds);

const now = new Date();
const scheduled = [];
for (const [, day, time, body] of Array.from(text.matchAll(/^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (.+)$/gm))) {
  const when = day + "T" + time;
  const date = new Date(when);
  if (isNaN(date) || date <= now) continue;
  const n = new Notification();
  n.identifier = ID_PREFIX + when + "-" + body;
  n.title = "Obsidian";
  n.body = body;
  n.sound = "default";
  n.openURL = "obsidian://open?vault=" + encodeURIComponent(VAULT) + "&file=" + encodeURIComponent(NOTE.replace(/\.md$/, ""));
  n.setTriggerDate(date);
  await n.schedule();
  scheduled.push(when.replace("T", " ") + " — " + body);
}

for (const [, minutes, body] of Array.from(text.matchAll(/^- \+(\d+) (.+)$/gm))) {
  const n = new Notification();
  n.identifier = ID_PREFIX + "in-" + minutes + "-" + body;
  n.title = "Obsidian";
  n.body = body;
  n.sound = "default";
  n.setTriggerDate(new Date(now.getTime() + Number(minutes) * 60000));
  await n.schedule();
  scheduled.push("через " + minutes + " мин — " + body);
}

const summary = scheduled.length ? scheduled.join("\n") : "Нет будущих уведомлений";
console.log(summary);
if (config.runsInApp) {
  const alert = new Alert();
  alert.title = "Запланировано: " + scheduled.length;
  alert.message = summary;
  alert.addAction("OK");
  await alert.present();
}
Script.complete();
```

## What Scriptable can do

The lists below are a rough map of what came up on 2026-10-27, not the full set. The source of truth is the [Scriptable docs](https://docs.scriptable.app/): read them before deciding something can't be done, and before relying on anything below.

### Notifications

See [Notification](https://docs.scriptable.app/notification/). Among other things:

- Text and look: `title`, `subtitle`, `body`, `sound`, `badge` (a number on Scriptable's icon), `threadIdentifier` (grouping).
- Tap: `openURL` opens any URL scheme (`obsidian://`, `shortcuts://`, `https://`).
- Long press: buttons via `addAction(title, url, destructive)`, each opening a URL; a script drawn inside the expanded notification via `scriptName`.
- Triggers: one date, daily, weekly.

Limits found so far: the icon is always Scriptable's and there's no image attachment; no Time Sensitive level (to break through Focus, add Scriptable to each Focus's allowed apps); a button can only open a URL, so it always switches to an app; iOS keeps at most 64 pending notifications per app.

### Alarms

Alarm-style alerts (full screen, ring in silent mode and Focus) are iOS 26 [AlarmKit](https://developer.apple.com/documentation/alarmkit), which each app has to adopt; Scriptable's docs don't have it. A real alarm in the Clock app can come from Shortcuts instead:

1. The automation runs the Scriptable script, which returns the alarms with `Script.setShortcutOutput(...)`, e.g. `["07:30 Встать"]`.
2. The same automation goes over the list: "Repeat with Each" → "Create Alarm" with that time and label.

A Clock alarm has a time of day and no date, so only alarms within the next 24 hours make sense. "Create Alarm" always adds a new one, so the automation has to skip times already set ("Get All Alarms") or it piles up duplicates. Not tried yet.

### Widgets

See [ListWidget](https://docs.scriptable.app/listwidget/) and its neighbours. A script builds a static layout (stacks, text, images, dates, SF Symbols) for home and lock screen widgets, and iOS re-runs it when it decides (`refreshAfterDate` is only a hint). A tap opens a URL: per element on medium and large widgets, the whole widget on small. No in-place buttons: a "checkbox" is a `scriptable:///run/...` link that opens Scriptable, and the widget redraws later.
