export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export class LocalDate {
	private constructor(private readonly epochDay: number) {}

	static of(year: number, month: number, day: number): LocalDate {
		return new LocalDate(Math.round(Date.UTC(year, month - 1, day) / DAY_MS));
	}

	static parse(text: string): LocalDate | null {
		const match = ISO_DATE.exec(text);
		if (!match) return null;
		const date = LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
		return date.toString() === text ? date : null;
	}

	static fromDate(date: Date): LocalDate {
		return LocalDate.of(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}

	private get utc(): Date {
		return new Date(this.epochDay * DAY_MS);
	}

	get year(): number {
		return this.utc.getUTCFullYear();
	}

	get month(): number {
		return this.utc.getUTCMonth() + 1;
	}

	get day(): number {
		return this.utc.getUTCDate();
	}

	weekday(): Weekday {
		return WEEKDAYS[(this.utc.getUTCDay() + 6) % 7];
	}

	addDays(days: number): LocalDate {
		return new LocalDate(this.epochDay + days);
	}

	daysSince(other: LocalDate): number {
		return this.epochDay - other.epochDay;
	}

	compare(other: LocalDate): number {
		return this.epochDay - other.epochDay;
	}

	equals(other: LocalDate): boolean {
		return this.epochDay === other.epochDay;
	}

	isBefore(other: LocalDate): boolean {
		return this.epochDay < other.epochDay;
	}

	isAfter(other: LocalDate): boolean {
		return this.epochDay > other.epochDay;
	}

	toString(): string {
		return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}`;
	}
}
