import { Habit } from "../domain/Habit";

export type HabitEntry =
	| { readonly kind: "ok"; readonly path: string; readonly habit: Habit }
	| { readonly kind: "broken"; readonly path: string; readonly name: string; readonly problem: string };

export interface HabitRepository {
	list(): HabitEntry[];
	get(path: string): HabitEntry | undefined;
	save(path: string, habit: Habit): Promise<void>;
	create(habit: Habit): Promise<string>;
}
