import { Clock } from "../domain/Clock";
import { DayMark } from "../domain/DayMark";
import { Habit, NewHabit, TextPart } from "../domain/Habit";
import { HabitColor } from "../domain/HabitColor";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { HabitRepository } from "./ports";

export class HabitService {
	constructor(
		private readonly repository: HabitRepository,
		private readonly clock: Clock,
	) {}

	today(): LocalDate {
		return this.clock.today();
	}

	async setMark(path: string, date: LocalDate, mark: DayMark | undefined): Promise<Habit> {
		const today = this.today();
		return this.repository.update(path, (habit) => habit.withMark(date, mark, today));
	}

	async replaceText(path: string, part: TextPart, value: string, because?: string): Promise<Habit> {
		const today = this.today();
		return this.repository.update(path, (habit) => habit.replaceText(part, value, today, because));
	}

	async clearText(path: string, part: TextPart): Promise<Habit> {
		const today = this.today();
		return this.repository.update(path, (habit) => habit.clearText(part, today));
	}

	async correctText(path: string, part: TextPart, value: string): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.correctText(part, value));
	}

	async replaceSchedule(path: string, days: readonly Weekday[], because?: string): Promise<Habit> {
		const today = this.today();
		return this.repository.update(path, (habit) => habit.replaceSchedule(new Schedule(days), today, because));
	}

	async correctSchedule(path: string, days: readonly Weekday[]): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.correctSchedule(new Schedule(days)));
	}

	async setColor(path: string, color: HabitColor | undefined): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.withColor(color));
	}

	/** Numbers the habits 1, 2, 3… in the given order with the given sections, writing only the ones that change. */
	async arrange(placements: readonly { readonly path: string; readonly section?: string }[]): Promise<void> {
		for (const [index, { path, section }] of placements.entries()) {
			const entry = this.repository.get(path);
			if (entry?.kind !== "ok" || (entry.habit.order === index + 1 && entry.habit.section === section)) continue;
			await this.repository.update(path, (habit) => habit.withOrder(index + 1).withSection(section));
		}
	}

	async setSection(path: string, section: string | undefined): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.withSection(section));
	}

	async archive(path: string): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.archive());
	}

	async restore(path: string): Promise<Habit> {
		return this.repository.update(path, (habit) => habit.restore());
	}

	async create(input: NewHabit): Promise<string> {
		return this.repository.create(Habit.create(input, this.today()));
	}

}
