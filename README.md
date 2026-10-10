# Marble Habit Tracker

A habit tracker for [Obsidian](https://obsidian.md) where every win drops a marble into a jar.

- **Close the day.** One list of today's habits. Tap the circle when it's done, hold it for "did more" or "not today" with a reason.
- **Watch the jar fill.** Every done day is a marble in the habit's colour. Seven marbles of one habit merge into a bigger one, four of those into the biggest.
- **Tilt to roll.** On a phone the marbles roll with the tilt of the device, with a light vibration.
- **Tiny is a win.** Built on BJ Fogg's Tiny Habits recipe: after I …, I will … — the tiny version counts as fully done.
- **Plain Markdown.** Each habit is a note in a folder of your choice; marks and recipe history live in its frontmatter.

## Install with BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community plugins.
2. BRAT → *Add beta plugin* → `kudrmax/obsidian-marble-habit-tracker`.
3. Enable **Marble Habit Tracker** and open it from the ribbon or the *Open habits* command.

## Development

```bash
npm install
npm test
npm run build
```

Releases are published on GitHub; BRAT installs and updates the plugin from them.
