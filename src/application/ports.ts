import { Habit } from "../domain/Habit";

export type HabitEntry =
	| { readonly kind: "ok"; readonly path: string; readonly habit: Habit }
	| { readonly kind: "broken"; readonly path: string; readonly name: string; readonly problem: string };

export interface HabitRepository {
	/** Whether the note at this path is a habit, i.e. lives in the habits folder. */
	contains(path: string): boolean;
	list(): HabitEntry[];
	get(path: string): HabitEntry | undefined;
	update(path: string, change: (habit: Habit) => Habit): Promise<Habit>;
	create(habit: Habit): Promise<string>;
}
