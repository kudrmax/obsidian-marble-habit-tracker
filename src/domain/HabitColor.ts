export const HABIT_COLORS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;
export type HabitColor = (typeof HABIT_COLORS)[number];

export function isHabitColor(value: unknown): value is HabitColor {
	return HABIT_COLORS.includes(value as HabitColor);
}
