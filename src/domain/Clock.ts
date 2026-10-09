import { LocalDate } from "./LocalDate";

export interface Clock {
	today(): LocalDate;
}

export const systemClock: Clock = { today: () => LocalDate.fromDate(new Date()) };
