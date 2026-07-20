# Pomodoro Blocker (macOS)

A menu-bar Pomodoro timer for macOS that blocks messaging and social apps
during focus sessions and automatically unblocks them on breaks.

While a focus session is running, it:

- **Quits blocked native apps** (by bundle identifier — e.g. Messages, Slack,
  Discord, WhatsApp, Telegram) and immediately re-quits them if you try to
  reopen one.
- **Null-routes blocked websites** (Instagram, X/Twitter, Facebook, TikTok,
  Reddit, Snapchat, WhatsApp Web, Discord, Google Messages, etc.) by editing
  `/etc/hosts` for the duration of the session, then restoring it on break/stop.

Everything reverts automatically when the focus session ends, when you hit
Stop, or when you quit the app.

## Requirements

- macOS 13 (Ventura) or later
- Xcode Command Line Tools (`xcode-select --install`) — provides `swift` and `codesign`

## Build & run

```bash
cd pomodoro-blocker
./Scripts/build-app.sh
open PomodoroBlocker.app
```

The first time you open it, macOS will warn it's from an unidentified
developer (it's ad-hoc signed, not notarized) — right-click the app and choose
**Open** to bypass that once.

To run it automatically at login: **System Settings → General → Login Items**
and add `PomodoroBlocker.app`.

For quick local development you can also run `swift run` directly from
`pomodoro-blocker/`, but notifications won't work in that mode (macOS only
delivers notifications to real bundled apps) — the timer, app-quitting, and
site-blocking all still work fine.

## Using it

Click the 🍅 icon in the menu bar:

- **Start Focus Session** — begins a 25-minute focus block (configurable),
  blocking apps/sites immediately.
- **Skip to Next Phase** — jump to the next break/focus phase.
- **Stop** — end the session early and unblock everything right away.
- **Edit Block List…** — reveals `config.json` in Finder so you can add or
  remove apps/sites and change durations.
- **Reload Block List** — re-reads `config.json` without restarting the app.

Config lives at:
`~/Library/Application Support/PomodoroBlocker/config.json`

```json
{
  "focusMinutes": 25,
  "shortBreakMinutes": 5,
  "longBreakMinutes": 15,
  "sessionsUntilLongBreak": 4,
  "blockedBundleIDs": ["com.apple.iChat", "com.tinyspeck.slackmacgap"],
  "blockedDomains": ["instagram.com", "x.com"]
}
```

### Finding an app's bundle identifier

The default `blockedBundleIDs` list is a best-effort guess — verify it
against what's actually on your Mac before relying on it, and add any others
you want blocked:

```bash
osascript -e 'id of app "Messages"'
# or
mdls -name kMDItemCFBundleIdentifier -r /Applications/Slack.app
```

## Important notes

- **Admin password prompts.** Editing `/etc/hosts` requires root, so macOS
  will show its native authorization dialog once when a focus session starts
  and once when it ends/breaks. This is intentional — the app does not
  weaken `sudo` or store your password.
- **A backup of `/etc/hosts`** is written to `/etc/hosts.pomodoro-bak` before
  each edit, in case something goes wrong. To manually restore your hosts
  file at any time: `sudo cp /etc/hosts.pomodoro-bak /etc/hosts`.
- **Crash safety.** If the app is killed (Cmd-Q, SIGTERM, SIGINT) mid-session
  it restores `/etc/hosts` on the way out. A hard crash (SIGKILL, force-quit
  from Activity Monitor, or a power loss) can leave your hosts file in the
  blocked state — check the "Important notes" restore command above if a
  site seems stuck.
- **Website blocking only affects new DNS lookups**, so an already-open
  browser tab to a blocked site may keep working until you reload it or open
  a new one. This is a hosts-file limitation, not a bug.
- **No App Store distribution.** This is a personal-use tool, ad-hoc signed
  and not sandboxed, run outside the App Store. That's what makes it able to
  actually quit other apps and edit `/etc/hosts` — a sandboxed/App Store app
  couldn't do either.
