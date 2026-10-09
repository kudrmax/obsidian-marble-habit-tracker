import { Clock } from "../domain/Clock";
import { DayMark, nextMark } from "../domain/DayMark";
import { DomainError } from "../domain/DomainError";
import { Habit, NewHabit, TextPart } from "../domain/Habit";
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

	async cycle(path: string, date: LocalDate): Promise<Habit> {
		const habit = this.load(path);
		return this.store(path, habit.withMark(date, nextMark(habit.markOn(date)), this.today()));
	}

	async setMark(path: string, date: LocalDate, mark: DayMark | undefined): Promise<Habit> {
		return this.store(path, this.load(path).withMark(date, mark, this.today()));
	}

	async replaceText(path: string, part: TextPart, value: string, because?: string): Promise<Habit> {
		return this.store(path, this.load(path).replaceText(part, value, this.today(), because));
	}

	async correctText(path: string, part: TextPart, value: string): Promise<Habit> {
		return this.store(path, this.load(path).correctText(part, value));
	}

	async replaceSchedule(path: string, days: readonly Weekday[], because?: string): Promise<Habit> {
		return this.store(path, this.load(path).replaceSchedule(new Schedule(days), this.today(), because));
	}

	async correctSchedule(path: string, days: readonly Weekday[]): Promise<Habit> {
		return this.store(path, this.load(path).correctSchedule(new Schedule(days)));
	}

	async archive(path: string): Promise<Habit> {
		return this.store(path, this.load(path).archive());
	}

	async create(input: NewHabit): Promise<string> {
		return this.repository.create(Habit.create(input, this.today()));
	}

	private load(path: string): Habit {
		const entry = this.repository.get(path);
		if (!entry) throw new DomainError("Привычка не найдена");
		if (entry.kind === "broken") throw new DomainError(`Привычка не читается: ${entry.problem}`);
		return entry.habit;
	}

	private async store(path: string, habit: Habit): Promise<Habit> {
		await this.repository.save(path, habit);
		return habit;
	}
}
