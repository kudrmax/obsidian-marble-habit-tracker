import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";

export function calendarStart(habit: Habit, today: LocalDate): LocalDate {
	const marks = habit.marks();
	const firstMark = marks.length ? marks[marks.length - 1][0] : today;
	return [habit.createdOn, firstMark, today].reduce((earliest, date) => (date.isBefore(earliest) ? date : earliest));
}

export function calendarWeeks(from: LocalDate, today: LocalDate): Array<Array<LocalDate | undefined>> {
	const weeks: Array<Array<LocalDate | undefined>> = [];
	for (let monday = from.addDays(-WEEKDAYS.indexOf(from.weekday())); !monday.isAfter(today); monday = monday.addDays(7)) {
		weeks.push(
			WEEKDAYS.map((_, index) => {
				const date = monday.addDays(index);
				return date.isAfter(today) ? undefined : date;
			}),
		);
	}
	return weeks;
}
