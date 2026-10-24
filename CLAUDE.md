# Marble Habit Tracker

## User-facing text stays true

Some text describes how the plugin behaves. When behavior changes, update that text in the same commit:

- `src/ui/help.ts` — the "How it works" window behind Today's "?". Update it when a gesture, a tap target, day navigation, drag and drop, marble merging or tilt/mouse behavior changes, or when something new and hidden is added to Today.
- `src/ui/HabitFormModal.ts` `GUIDE` — what each recipe field is for, with examples. Update it when fields are added, renamed or change meaning.
- `src/ui/SettingsTab.ts` descriptions and `README.md` — update when a setting or feature changes.

Numbers and names that come from settings (merge counts, field labels) are passed in, never written into the text.

## One design system

Every look value lives in one place, so a new screen can only be built from the parts the phone already has:

- `styles.css` — the `body { … }` block at the top holds every token: colours (through Obsidian's theme where it has one), radii, sizes, type, spacing, opacity, layers, motion. Component rules only read `var(--th-…)` tokens. Need a value that isn't there? Reuse the token of the same part on the phone; add a new token, named for what it is for, only for something new that was agreed.
- Everything is round: a circle is `--th-radius-circle`, anything longer than tall is `--th-radius-capsule`.
- `src/ui/design.ts` `DESIGN` — the measures TypeScript lays the calendar out with; each one names its CSS token in `DESIGN_TOKENS`.
- `tests/styles.test.ts` fails on a number, colour, curve, font or radius written into a rule, on Obsidian's variables read outside the tokens, on unused or undefined tokens, on `DESIGN` disagreeing with the CSS, and on a size or time written inline in TypeScript instead of a named constant. Don't loosen it to pass: move the value into a token.
