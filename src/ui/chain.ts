import { DayMark, isDone } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";

export interface CellLook {
	readonly mark?: DayMark;
	readonly scheduled: boolean;
	readonly joinLeft: boolean;
	readonly joinRight: boolean;
}

export function cellLook(habit: Habit, date: LocalDate): CellLook {
	const mark = habit.markOn(date);
	const done = isDone(mark);
	return {
		mark,
		scheduled: habit.isScheduled(date),
		joinLeft: done && isDone(habit.markOn(date.addDays(-1))),
		joinRight: done && isDone(habit.markOn(date.addDays(1))),
	};
}
