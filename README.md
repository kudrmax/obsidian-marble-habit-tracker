# Marble Habit Tracker

A habit tracker for [Obsidian](https://obsidian.md) where every win drops a marble into a jar.

- **Close the day.** One list of today's habits. Tap the circle and the answers slide into the row as buttons — Full, Tiny or Skip, with a reason for a skip. Tap a marked circle to clear it.
- **Watch the jar fill.** Every done day is a marble in the habit's colour. Seven marbles of one habit merge into a bigger one, four of those into the biggest.
- **Tilt to roll.** On a phone the marbles roll with the tilt of the device, with a light vibration.
- **Tiny is a win.** Built on BJ Fogg's Tiny Habits recipe: after I …, I will … — the tiny version counts as fully done.
- **Look back.** This week's dates sit at the bottom of Today. Pull them up for the whole month, each day in a ring of how much of it was done, and page back to earlier months; tap a day to mark it.
- **All habits.** The list button at the top of Today, or the *Open all habits* command, shows every habit with its days and wins, archived ones folded at the bottom.
- **Plain Markdown.** Each habit is a note in a folder of your choice; marks and recipe history live in its frontmatter.

## Install with BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community plugins.
2. BRAT → *Add beta plugin* → `kudrmax/obsidian-marble-habit-tracker`.
3. Tag a note `#marble-habit` (or pick a folder in the settings) and it becomes a habit.
4. Enable **Marble Habit Tracker** and open it from the ribbon or the *Open habits* command.

## Development

```bash
npm install
npm test
npm run build
```

Releases are published on GitHub; BRAT installs and updates the plugin from them.
