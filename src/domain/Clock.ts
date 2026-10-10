import { LocalDate } from "./LocalDate";

export interface Clock {
	today(): LocalDate;
}

/** A day that starts at `startHour` instead of midnight: past midnight but before that hour it is still the day before. */
export class DayStartClock implements Clock {
	constructor(
		private readonly startHour: () => number,
		private readonly now: () => Date = () => new Date(),
	) {}

	today(): LocalDate {
		const now = this.now();
		const date = LocalDate.fromDate(now);
		return now.getHours() < this.startHour() ? date.addDays(-1) : date;
	}
}
