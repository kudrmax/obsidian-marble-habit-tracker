# Marble Habit Tracker

A habit tracker for [Obsidian](https://obsidian.md) where every win drops a marble into a jar.

- **Close the day.** One list of today's habits. Tap the circle and the answers slide into the row as buttons — Full, Tiny or Skip, with a reason for a skip. Tap a marked circle to clear it.
- **Not at the trigger.** Turn on *Done without the trigger* and a habit can get a fourth answer, Anytime, for a day it was done at another moment. Such a day gives no marble and breaks the streak, unless *Not at the trigger is a win* is on.
- **Watch the jar fill.** Every win is a marble in the habit's colour; the circles and the answers keep to Obsidian's accent, so the colour on Today is the marbles'. Seven marbles of one habit merge into a bigger one, four of those into the biggest.
- **Tilt to roll.** On a phone the marbles roll with the tilt of the device, with a light vibration.
- **Tiny is a win.** Built on BJ Fogg's Tiny Habits recipe: after I …, I will … — the tiny version counts as fully done.
- **Look back.** This week's dates sit at the bottom of Today. Pull them up for the whole month, each day in a ring of how much of it was done, and page back to earlier months; tap a day to mark it.
- **On a computer.** Nothing is pulled with a mouse: the week sits over the list, and a click on the month's name opens the whole month in place. In a wide tab the marbles grow, so its long floor still holds a pile; the mouse rolls them.
- **The last few days.** The week button over Today's calendar, or the *Open the week* command, turns Today into a grid: every habit in a row, its name on the left and a circle for each of the last days on the right — five by default, three to seven in the settings — answered right there the way Today answers, the answers standing at the row's right end. The calendar's dates stand over the columns on a computer, whose arrows step as many days, and under them in the folded bar on a phone. A tap on one of them ends the days on it, and arrows on the bar's left step them a day. Pulled up, the bar's month marks those days with a band, the dates travelling up into it; drag the band along the month, a week at a time up or down and across the month's start onto the week before it, or tap a day to end the days on it. The month's arrows keep the band when the next month shows its days too, and otherwise move it to that month's last days. The neighbouring months' days in the bar's month keep their rings, on Today as on the grid. The tab keeps the view it was left on.
- **All habits.** The list button over Today's calendar, or the *Open all habits* command, shows every habit with its days and wins, archived ones folded at the bottom. The calendar stays under it; tap a day to go back to Today on it.
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
