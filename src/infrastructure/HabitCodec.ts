import { Component, Version } from "../domain/Component";
import { DayMark, FULL, TINY, missed } from "../domain/DayMark";
import { DomainError } from "../domain/DomainError";
import { Habit, TEXT_PARTS, TextPart, sameSchedule } from "../domain/Habit";
import { HabitColor, isHabitColor } from "../domain/HabitColor";
import { LocalDate, WEEKDAYS, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";

export type Frontmatter = Record<string, unknown>;

export class HabitDecodeError extends Error {}

const DONE_TINY = "done_tiny";
const DONE_FULL = "done_full";
const MISSED = "missed";

export function decodeHabit(name: string, frontmatter: Frontmatter | null | undefined): Habit {
	if (!frontmatter) throw new HabitDecodeError("нет свойств привычки");
	try {
		const text = Object.fromEntries(TEXT_PARTS.map((part) => [part, readVersions(frontmatter, part, readText)])) as Record<
			TextPart,
			Component<string>
		>;
		return Habit.restore({
			name,
			order: readOrder(frontmatter.order),
			color: readColor(frontmatter.color),
			archived: frontmatter.archived === true,
			schedule: readVersions(frontmatter, "schedule", readSchedule, sameSchedule),
			text,
			marks: readMarks(frontmatter),
		});
	} catch (error) {
		if (error instanceof DomainError) throw new HabitDecodeError(error.message);
		throw error;
	}
}

export function encodeHabit(habit: Habit, frontmatter: Frontmatter): void {
	put(frontmatter, "order", habit.order);
	put(frontmatter, "color", habit.color);
	frontmatter.schedule = encodeVersions(habit.schedule.versions, (schedule) => schedule.weekdays);
	for (const part of TEXT_PARTS) put(frontmatter, part, nonEmpty(encodeVersions(habit.text(part).versions, (value) => value)));
	const marks = habit.marks();
	const datesOf = (kind: "tiny" | "full") => marks.filter(([, mark]) => mark.kind === kind).map(([date]) => date.toString());
	put(frontmatter, DONE_TINY, nonEmpty(datesOf("tiny")));
	put(frontmatter, DONE_FULL, nonEmpty(datesOf("full")));
	put(
		frontmatter,
		MISSED,
		nonEmpty(marks.flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date: date.toString(), reason: mark.reason }] : []))),
	);
	put(frontmatter, "archived", habit.archived ? true : undefined);
}

function put(frontmatter: Frontmatter, key: string, value: unknown): void {
	if (value === undefined) delete frontmatter[key];
	else frontmatter[key] = value;
}

function nonEmpty<T>(items: T[]): T[] | undefined {
	return items.length ? items : undefined;
}

function encodeVersions<T>(versions: readonly Version<T>[], encode: (value: T) => unknown): Frontmatter[] {
	return versions.map((version) => ({
		value: encode(version.value),
		since: version.since.toString(),
		...(version.replacedBecause ? { replaced_because: version.replacedBecause } : {}),
	}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function list(frontmatter: Frontmatter, key: string): unknown[] {
	const value = frontmatter[key];
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new HabitDecodeError(`${key}: ожидается список`);
	return value;
}

function readOrder(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new HabitDecodeError(`order: ожидается число, а не «${String(value)}»`);
}

function readColor(value: unknown): HabitColor | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (isHabitColor(value)) return value;
	throw new HabitDecodeError(`color: unknown color "${String(value)}"`);
}

function readDate(value: unknown, where: string): LocalDate {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
	}
	const date = typeof value === "string" ? LocalDate.parse(value.trim()) : null;
	if (!date) throw new HabitDecodeError(`${where}: некорректная дата «${String(value)}»`);
	return date;
}

function readText(value: unknown, where: string): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	throw new HabitDecodeError(`${where}: ожидается текст`);
}

function readSchedule(value: unknown, where: string): Schedule {
	if (!Array.isArray(value)) throw new HabitDecodeError(`${where}: ожидается список дней`);
	const days = value.map((day) => {
		if (!WEEKDAYS.includes(day as Weekday)) throw new HabitDecodeError(`${where}: неизвестный день «${String(day)}»`);
		return day as Weekday;
	});
	return new Schedule(days);
}

function readVersions<T>(
	frontmatter: Frontmatter,
	key: string,
	readValue: (value: unknown, where: string) => T,
	same?: (a: T, b: T) => boolean,
): Component<T> {
	const versions = list(frontmatter, key).map((item): Version<T> => {
		if (!isRecord(item)) throw new HabitDecodeError(`${key}: ожидаются записи с value и since`);
		const because = item.replaced_because;
		return {
			value: readValue(item.value, key),
			since: readDate(item.since, key),
			...(typeof because === "string" && because.trim() ? { replacedBecause: because.trim() } : {}),
		};
	});
	versions.sort((a, b) => b.since.compare(a.since));
	return Component.of(versions, same);
}

function readMarks(frontmatter: Frontmatter): Map<string, DayMark> {
	const marks = new Map<string, DayMark>();
	const add = (date: LocalDate, mark: DayMark, key: string) => {
		const id = date.toString();
		const existing = marks.get(id);
		if (existing && JSON.stringify(existing) === JSON.stringify(mark)) return;
		if (existing) throw new HabitDecodeError(`${key}: у дня ${id} уже есть другая отметка`);
		marks.set(id, mark);
	};
	for (const value of list(frontmatter, DONE_TINY)) add(readDate(value, DONE_TINY), TINY, DONE_TINY);
	for (const value of list(frontmatter, DONE_FULL)) add(readDate(value, DONE_FULL), FULL, DONE_FULL);
	for (const item of list(frontmatter, MISSED)) {
		if (!isRecord(item)) throw new HabitDecodeError(`${MISSED}: ожидаются записи с date и reason`);
		add(readDate(item.date, MISSED), missed(typeof item.reason === "string" ? item.reason : ""), MISSED);
	}
	return marks;
}
