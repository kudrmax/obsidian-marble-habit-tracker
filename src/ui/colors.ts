import { HabitColor } from "../domain/HabitColor";

export function colorClass(color: HabitColor | undefined): string {
	return color ? `th-color-${color}` : "th-color-accent";
}
