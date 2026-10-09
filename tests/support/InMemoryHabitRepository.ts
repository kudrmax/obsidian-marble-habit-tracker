import { HabitEntry, HabitRepository } from "../../src/application/ports";
import { DomainError } from "../../src/domain/DomainError";
import { Habit } from "../../src/domain/Habit";

export class InMemoryHabitRepository implements HabitRepository {
	readonly entries = new Map<string, HabitEntry>();

	list(): HabitEntry[] {
		return [...this.entries.values()];
	}

	get(path: string): HabitEntry | undefined {
		return this.entries.get(path);
	}

	async update(path: string, change: (habit: Habit) => Habit): Promise<Habit> {
		const entry = this.entries.get(path);
		if (!entry) throw new DomainError("Habit not found");
		if (entry.kind === "broken") throw new DomainError(`Habit can't be read: ${entry.problem}`);
		const habit = change(entry.habit);
		this.entries.set(path, { kind: "ok", path, habit });
		return habit;
	}

	async create(habit: Habit): Promise<string> {
		const path = `Habits/${habit.name}.md`;
		if (this.entries.has(path)) throw new DomainError(`Habit "${habit.name}" already exists`);
		this.entries.set(path, { kind: "ok", path, habit });
		return path;
	}

	habit(path: string): Habit {
		const entry = this.entries.get(path);
		if (entry?.kind !== "ok") throw new Error(`No readable habit at ${path}`);
		return entry.habit;
	}
}
