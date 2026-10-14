# Marble Habit Tracker

## User-facing text stays true

Some text describes how the plugin behaves. When behavior changes, update that text in the same commit:

- `src/ui/help.ts` — the "How it works" window behind Today's "?". Update it when a gesture, a tap target, day navigation, drag and drop, marble merging or tilt/mouse behavior changes, or when something new and hidden is added to Today.
- `src/ui/HabitFormModal.ts` `GUIDE` — what each recipe field is for, with examples. Update it when fields are added, renamed or change meaning.
- `src/ui/SettingsTab.ts` descriptions and `README.md` — update when a setting or feature changes.

Numbers and names that come from settings (merge counts, field labels) are passed in, never written into the text.
