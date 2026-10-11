import { Component, Version } from "../domain/Component";
import { DayMark, FULL, TINY, done, isOffTrigger, missed } from "../domain/DayMark";
import { DomainError } from "../domain/DomainError";
import { Habit, TEXT_PARTS, TextPart, sameSchedule } from "../domain/Habit";
import { HabitColor, isHabitColor } from "../domain/HabitColor";
import { LocalDate, WEEKDAYS, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";

export type Frontmatter = Record<string, unknown>;

export class HabitDecodeError extends Error {}

/** The frontmatter property each part of a habit is stored under. */
export interface PropertyNames {
	readonly order: string;
	readonly section: string;
	readonly color: string;
	readonly archived: string;
	readonly anytime: string;
	readonly schedule: string;
	readonly anchor: string;
	readonly tiny: string;
	readonly full: string;
	readonly celebration: string;
	readonly doneTiny: string;
	readonly doneFull: string;
	readonly missed: string;
	readonly offTrigger: string;
}

export const DEFAULT_PROPERTY_NAMES: PropertyNames = {
	order: "order",
	section: "section",
	color: "color",
	archived: "archived",
	anytime: "anytime",
	schedule: "schedule",
	anchor: "anchor",
	tiny: "tiny",
	full: "full",
	celebration: "celebration",
	doneTiny: "done_tiny",
	doneFull: "done_full",
	missed: "missed",
	offTrigger: "off_trigger",
};

export function decodeHabit(name: string, frontmatter: Frontmatter | null | undefined, keys: PropertyNames = DEFAULT_PROPERTY_NAMES): Habit {
	if (!frontmatter) throw new HabitDecodeError("no habit properties");
	try {
		const text = Object.fromEntries(TEXT_PARTS.map((part) => [part, readVersions(frontmatter, keys[part], readText)])) as Record<
			TextPart,
			Component<string>
		>;
		return Habit.restore({
			name,
			order: readOrder(frontmatter[keys.order], keys.order),
			section: readSection(frontmatter[keys.section]),
			color: readColor(frontmatter[keys.color], keys.color),
			archived: frontmatter[keys.archived] === true,
			anytime: frontmatter[keys.anytime] === true,
			schedule: readVersions(frontmatter, keys.schedule, readSchedule, sameSchedule),
			text,
			marks: readMarks(frontmatter, keys),
		});
	} catch (error) {
		if (error instanceof DomainError) throw new HabitDecodeError(error.message);
		throw error;
	}
}

export function encodeHabit(habit: Habit, frontmatter: Frontmatter, keys: PropertyNames = DEFAULT_PROPERTY_NAMES): void {
	put(frontmatter, keys.order, habit.order);
	put(frontmatter, keys.section, habit.section);
	put(frontmatter, keys.color, habit.color);
	frontmatter[keys.schedule] = encodeVersions(habit.schedule.versions, (schedule) => schedule.weekdays);
	for (const part of TEXT_PARTS) put(frontmatter, keys[part], nonEmpty(encodeVersions(habit.text(part).versions, (value) => value)));
	const marks = habit.marks();
	const datesOf = (kind: "tiny" | "full") => marks.filter(([, mark]) => mark.kind === kind).map(([date]) => date.toString());
	put(frontmatter, keys.doneTiny, nonEmpty(datesOf("tiny")));
	put(frontmatter, keys.doneFull, nonEmpty(datesOf("full")));
	put(
		frontmatter,
		keys.missed,
		nonEmpty(marks.flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date: date.toString(), reason: mark.reason }] : []))),
	);
	put(frontmatter, keys.archived, habit.archived ? true : undefined);
	put(frontmatter, keys.anytime, habit.anytime ? true : undefined);
	put(frontmatter, keys.offTrigger, nonEmpty(marks.filter(([, mark]) => isOffTrigger(mark)).map(([date]) => date.toString())));
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
	if (!Array.isArray(value)) throw new HabitDecodeError(`${key}: expected a list`);
	return value;
}

function readOrder(value: unknown, key: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new HabitDecodeError(`${key}: expected a number, got "${String(value)}"`);
}

function readSection(value: unknown): string | undefined {
	if (typeof value === "number") return String(value);
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readColor(value: unknown, key: string): HabitColor | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (isHabitColor(value)) return value;
	throw new HabitDecodeError(`${key}: unknown color "${String(value)}"`);
}

function readDate(value: unknown, where: string): LocalDate {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
	}
	const date = typeof value === "string" ? LocalDate.parse(value.trim()) : null;
	if (!date) throw new HabitDecodeError(`${where}: invalid date "${String(value)}"`);
	return date;
}

function readText(value: unknown, where: string): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	throw new HabitDecodeError(`${where}: expected text`);
}

function readSchedule(value: unknown, where: string): Schedule {
	if (!Array.isArray(value)) throw new HabitDecodeError(`${where}: expected a list of days`);
	const days = value.map((day) => {
		if (!WEEKDAYS.includes(day as Weekday)) throw new HabitDecodeError(`${where}: unknown day "${String(day)}"`);
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
		if (!isRecord(item)) throw new HabitDecodeError(`${key}: expected entries with value and since`);
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

function readMarks(frontmatter: Frontmatter, keys: PropertyNames): Map<string, DayMark> {
	const marks = new Map<string, DayMark>();
	const add = (date: LocalDate, mark: DayMark, key: string) => {
		const id = date.toString();
		const existing = marks.get(id);
		if (existing && JSON.stringify(existing) === JSON.stringify(mark)) return;
		if (existing) throw new HabitDecodeError(`${key}: ${id} already has another mark`);
		marks.set(id, mark);
	};
	for (const value of list(frontmatter, keys.doneTiny)) add(readDate(value, keys.doneTiny), TINY, keys.doneTiny);
	for (const value of list(frontmatter, keys.doneFull)) add(readDate(value, keys.doneFull), FULL, keys.doneFull);
	for (const item of list(frontmatter, keys.missed)) {
		if (!isRecord(item)) throw new HabitDecodeError(`${keys.missed}: expected entries with date and reason`);
		add(readDate(item.date, keys.missed), missed(typeof item.reason === "string" ? item.reason : ""), keys.missed);
	}
	for (const value of list(frontmatter, keys.offTrigger)) {
		const id = readDate(value, keys.offTrigger).toString();
		const mark = marks.get(id);
		if (mark && mark.kind !== "missed") marks.set(id, done(mark.kind, true));
	}
	return marks;
}
