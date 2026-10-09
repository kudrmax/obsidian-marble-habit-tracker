# Tiny Habits — design

Date: 2026-10-09. Status: approved by the author. Source canvas: https://claude.ai/artifact/5DmPf9vDjD312jYyp1mrB5 — the `canvas/` folder holds the same screens as `.dc.html` files (open `canvas.json` for the layout).

This document wins over `docs/superpowers/specs/2026-10-09-best-habit-experience-design.md` where they disagree. Scenarios and the reasoning behind them: `docs/superpowers/specs/2026-10-09-main-screen-scenarios.md`.

## Principles

1. **Close the day.** The main goal of a day is to answer every habit: done, did more, or not today with a reason.
2. **Tiny is success.** A tiny mark is a full, equal-size mark. "Did more" is the same mark plus a spark — never bigger, never "more correct".
3. **Reward right after the tap.** The mark pops, a ball drops into the jar, the celebration phrase replaces the subtitle for ~2 s.
4. **Minimal and native.** Only Obsidian theme variables, the system font, hairline separators, no cards, no colour noise. Habit colour appears only where it means "this habit" — the mark, its balls, its grid.
5. **Mobile first.** Every screen is drawn at 390 pt first; desktop is the same screen in a wider tab.

## Today (main screen)

- No date. Title: "Three left to close the day" → "Day closed". Under it a 3 px neutral progress line (`answered / habits`).
- Rows: the tiny action (17 px), the anchor under it ("after I …", 13 px, faint). The row text opens the habit.
- Circle on the right (28 px inside a 48 px target):
  - **tap** → tiny done, immediately;
  - **hold** (450 ms) on mobile, **right-click** or hold on desktop → three circles fan out: ✕ not today · ✦ did more · ✓ done (✓ stays where the original circle was);
  - choosing the answer that is already set clears it.
- Not today → reason chips: Forgot · Anchor didn't happen · No energy · Felt too big · Other… (free text + Save / Enter). "Felt too big" offers "Make it even tinier" → the Edit screen for the tiny part.
- Done habits leave the list after the celebration; a single row "● ● N done · Show/Hide" keeps them reachable. Not-today rows stay, greyed.
- The list scrolls above the jar; the jar never scrolls.
- Desktop: the list is a 640 px column centred in the tab, the jar spans the whole tab width, hovering a row shows "click · right-click for more".
- Empty state: "Start with one tiny habit" and a round "+" button. Nothing else.

## The jar

- Lives at the bottom of the Today view, behind the list, full width.
- **Derived from history, not stored.** For every habit, take its done days oldest → newest, gaps don't matter. Every 4×7 = 28 days make one **big** ball, every remaining full 7 make one **medium** ball, the rest are **small** balls. "Did more" days keep a spark on small balls.
- Sizes (diameter): small 24 px, medium 44 px, big 68 px.
- Physics: circles under gravity, verlet integration, 3 collision passes, damping 0.985, gravity 0.45 px/frame². Settles in ~5 s; the loop stops when nothing moves.
- A new mark drops a small ball from the tapped circle. If that makes 7 of that habit, the 7 small balls fly together and are replaced by one medium ball (and 4 medium → one big) with a short caption "Read · 7 wins".
- Undoing today's mark removes today's ball.
- If it lags, cache the derived pile per habit (key: path + mtime). Not before.

### Materials (plugin setting)

All three are circles with the habit colour. Built from SVG, see `canvas/Assets.dc.html`.

| Material | Recipe |
|---|---|
| **Grain** (default) | flat fill; shadow side `M-60 26 C-14 48 34 22 60 -36 L60 60 L-60 60 Z` in colour L−15; fractal-noise grain at 22 % |
| **Aura** | radial gradient (focus 32 % / 26 %): hue −16 L+16 → colour (S+6) at 60 % → hue +16 L−14; big balls glow `drop-shadow(0 0 12% colour/45%)` |
| **Halftone** | fill colour L−10; white 6 px dot pattern rotated 30°, masked by a radial gradient lit from the top-left, 75 % |

Big balls carry a 4-point star (Grain: dark `#1e1e1e`-like background colour, others: white). Did-more small balls carry a small white spark at the top-right.

## Habit screen

Three sections with uppercase 13 px headings and hairlines between them:

1. **Recipe** — "After I" and "I will" on separate rows, then More / Celebrate / Days. Every value opens Edit.
2. **Progress** — three numbers (in a row · best · wins) and a year grid: 7 rows = weekdays (M/W/F labels), columns = weeks, 16 px circles, opened at the current week, scrolls into the past. Read-only — marking happens only on Today.
3. **History** — two groups: **Not today** (date · reason) and **Recipe changes** (date · what → value · why), ending with "Started".

Archive and Open note live in the view menu.

## Edit

One screen for any recipe part: ✕ · habit name · ✓. A label ("I will") and one free-text field. Saving replaces the version from today (same-day edits overwrite, as the domain already does).

## New habit

✕ · New habit · ✓ (disabled until anchor, tiny and name are filled). Fields read as a recipe: After I · I will · If I feel like more (optional) · And celebrate with (optional) · Call it. Days — seven round toggles. Color — eight round swatches from the Obsidian palette.

## Settings (reference only)

Use Obsidian's native settings tab. Offer: jar material (Grain / Aura / Halftone), celebration line on/off, reduce motion (balls fade in instead of falling), habits folder, redesign threshold.

## Style system

- Every colour, size and radius is a CSS variable in `styles.css`, mapped to Obsidian variables (`--background-primary`, `--text-normal`, `--text-muted`, `--text-faint`, `--background-modifier-border`, `--interactive-accent`, `--color-*`).
- Shared components are plain classes: `th-button` (round icon button, `th-button-primary` filled), `th-chip`, `th-circle` (answer circle), `th-field` (underlined input), `th-section`, `th-row`. A new control uses an existing class; only a new kind of object gets new CSS.
