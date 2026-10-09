import { DomainError } from "./DomainError";
import { LocalDate, WEEKDAYS, Weekday } from "./LocalDate";

export class Schedule {
	private readonly days: ReadonlySet<Weekday>;

	constructor(days: Iterable<Weekday>) {
		this.days = new Set(days);
		if (this.days.size === 0) throw new DomainError("В расписании нужен хотя бы один день");
	}

	static everyDay(): Schedule {
		return new Schedule(WEEKDAYS);
	}

	get weekdays(): Weekday[] {
		return WEEKDAYS.filter((day) => this.days.has(day));
	}

	get isEveryDay(): boolean {
		return this.days.size === WEEKDAYS.length;
	}

	includes(date: LocalDate): boolean {
		return this.days.has(date.weekday());
	}

	equals(other: Schedule): boolean {
		return this.weekdays.join() === other.weekdays.join();
	}
}
