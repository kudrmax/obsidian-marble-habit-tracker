# Marble Habit Tracker

## User-facing text stays true

Some text describes how the plugin behaves. When behavior changes, update that text in the same commit:

- `src/ui/HabitFormModal.ts` `GUIDE` — what each recipe field is for, with examples. Update it when fields are added, renamed or change meaning.
- `src/ui/SettingsTab.ts` descriptions and `README.md` — update when a setting or feature changes.

Numbers and names that come from settings (merge counts, field labels) are passed in, never written into the text.

## One design system

Every look value lives in one place, so a new screen can only be built from the parts the phone already has:

- `styles.css` — the `body { … }` block at the top holds every token: colours (through Obsidian's theme where it has one), radii, sizes, type, spacing, opacity, layers, motion. Component rules only read `var(--th-…)` tokens. Need a value that isn't there? Reuse the token of the same part on the phone; add a new token, named for what it is for, only for something new that was agreed.
- Everything is round: a circle is `--th-radius-circle`, anything longer than tall is `--th-radius-capsule`.
- `src/ui/design.ts` `DESIGN` — the measures TypeScript lays the calendar out with; each one names its CSS token in `DESIGN_TOKENS`.
- `tests/styles.test.ts` fails on a number, colour, curve, font or radius written into a rule, on Obsidian's variables read outside the tokens, on unused or undefined tokens, on `DESIGN` disagreeing with the CSS, and on a size or time written inline in TypeScript instead of a named constant. Don't loosen it to pass: move the value into a token.

## Trying a build

A branch build is tried on this laptop in a separate Obsidian, the phone view and the desktop view, never in Max's own Obsidian or vault: `~/Obsidian` is production and syncs to his phone.

- The separate Obsidian runs with its own profile and a scratch vault: `open -n -a Obsidian --args --user-data-dir=<scratch>/obsidian-user --remote-debugging-port=9333`, the vault registered in that profile's `obsidian.json`, holding copies of Max's habit notes and the plugin's `data.json`, with the branch build in its `.obsidian/plugins/marble-habit-tracker/`. Reuse one that is already running (`ps aux | grep remote-debugging-port`); never open a scratch vault with `obsidian://open`.
- Check the build there first yourself, over the debugging port: the phone view (window 402×874, then `app.emulateMobile(true)`) and the desktop view. Then leave it open for Max to click through, with a checklist of what to try.
- `~/Obsidian/.obsidian/plugins/marble-habit-tracker/` only ever gets released versions, downloaded from the GitHub release. Never copy a branch build there, never touch its `data.json`.
- A page in a browser is not a check: it runs the code outside Obsidian and misses what Obsidian adds.
