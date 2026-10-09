import { HabitEntry } from "../../src/application/ports";
import { Habit } from "../../src/domain/Habit";
import { InMemoryHabitRepository } from "./InMemoryHabitRepository";

export class StaleReadRepository extends InMemoryHabitRepository {
	private snapshot = new Map<string, HabitEntry>();

	freeze(): void {
		this.snapshot = new Map(this.entries);
	}

	override get(path: string): HabitEntry | undefined {
		return this.snapshot.get(path);
	}

	freshHabit(path: string): Habit {
		return this.habit(path);
	}
}
