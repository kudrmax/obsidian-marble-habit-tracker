import { Component, Version } from "./Component";
import { DayMark } from "./DayMark";
import { DomainError } from "./DomainError";
import { HabitColor } from "./HabitColor";
import { LocalDate, Weekday } from "./LocalDate";
import { Schedule } from "./Schedule";

export const TEXT_PARTS = ["anchor", "tiny", "full", "celebration"] as const;
export type TextPart = (typeof TEXT_PARTS)[number];
export type Part = TextPart | "schedule";

const REQUIRED_TEXT: ReadonlyArray<[TextPart, string]> = [
	["anchor", "Anchor is missing"],
	["tiny", "Tiny habit is missing"],
];
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|#^[\]]/;

export const sameSchedule = (a: Schedule, b: Schedule): boolean => a.equals(b);

export interface HabitState {
	readonly name: string;
	readonly order?: number;
	readonly color?: HabitColor;
	readonly archived: boolean;
	readonly schedule: Component<Schedule>;
	readonly text: Readonly<Record<TextPart, Component<string>>>;
	readonly marks: ReadonlyMap<string, DayMark>;
}

export interface NewHabit {
	readonly name: string;
	readonly anchor: string;
	readonly tiny: string;
	readonly full?: string;
	readonly celebration?: string;
	readonly color?: HabitColor;
	readonly days: readonly Weekday[];
}

interface ChangeBase {
	readonly date: LocalDate;
	readonly because?: string;
}

export type RecipeChange =
	| (ChangeBase & { readonly part: TextPart; readonly from?: string; readonly to: string })
	| (ChangeBase & { readonly part: "schedule"; readonly from?: Schedule; readonly to: Schedule });

function requireText(value: string): string {
	const text = value.trim();
	if (!text) throw new DomainError("Value can't be empty");
	return text;
}

export class Habit {
	private constructor(private readonly state: HabitState) {}

	static restore(state: HabitState): Habit {
		const name = state.name.trim();
		if (!name) throw new DomainError("Give the habit a name");
		if (FORBIDDEN_NAME_CHARS.test(name)) throw new DomainError('A name can\'t contain \\ / : * ? " < > | # ^ [ ]');
		if (state.schedule.isEmpty) throw new DomainError("Schedule is missing");
		for (const [part, message] of REQUIRED_TEXT) if (state.text[part].isEmpty) throw new DomainError(message);
		for (const [part, component] of Object.entries(state.text)) {
			if (component.versions.some((version) => !version.value.trim())) throw new DomainError(`${part} has an empty value`);
		}
		return new Habit({ ...state, name });
	}

	static create(input: NewHabit, today: LocalDate): Habit {
		const start = (value?: string): Component<string> => {
			const text = value?.trim();
			return text ? Component.start(text, today) : Component.empty<string>();
		};
		return Habit.restore({
			name: input.name,
			color: input.color,
			archived: false,
			schedule: Component.start(new Schedule(input.days), today, sameSchedule),
			text: {
				anchor: start(input.anchor),
				tiny: start(input.tiny),
				full: start(input.full),
				celebration: start(input.celebration),
			},
			marks: new Map(),
		});
	}

	get name(): string {
		return this.state.name;
	}

	get order(): number | undefined {
		return this.state.order;
	}

	get color(): HabitColor | undefined {
		return this.state.color;
	}

	get archived(): boolean {
		return this.state.archived;
	}

	get schedule(): Component<Schedule> {
		return this.state.schedule;
	}

	get currentSchedule(): Schedule {
		return this.state.schedule.versions[0].value;
	}

	get createdOn(): LocalDate {
		const firsts = [this.state.schedule.versions, this.state.text.anchor.versions, this.state.text.tiny.versions].map(
			(versions) => versions[versions.length - 1].since,
		);
		return firsts.reduce((earliest, date) => (date.isBefore(earliest) ? date : earliest));
	}

	text(part: TextPart): Component<string> {
		return this.state.text[part];
	}

	isScheduled(date: LocalDate): boolean {
		return this.state.schedule.at(date)?.includes(date) ?? false;
	}

	markOn(date: LocalDate): DayMark | undefined {
		return this.state.marks.get(date.toString());
	}

	marks(): Array<[LocalDate, DayMark]> {
		return [...this.state.marks]
			.flatMap(([key, mark]): Array<[LocalDate, DayMark]> => {
				const date = LocalDate.parse(key);
				return date ? [[date, mark]] : [];
			})
			.sort(([a], [b]) => b.compare(a));
	}

	withMark(date: LocalDate, mark: DayMark | undefined, today: LocalDate): Habit {
		if (date.isAfter(today)) throw new DomainError("Can't mark a day in the future");
		const marks = new Map(this.state.marks);
		if (mark) marks.set(date.toString(), mark);
		else marks.delete(date.toString());
		return new Habit({ ...this.state, marks });
	}

	replaceText(part: TextPart, value: string, today: LocalDate, because?: string): Habit {
		return this.withText(part, this.state.text[part].replace(requireText(value), today, because));
	}

	correctText(part: TextPart, value: string): Habit {
		return this.withText(part, this.state.text[part].correct(requireText(value)));
	}

	replaceSchedule(schedule: Schedule, today: LocalDate, because?: string): Habit {
		return new Habit({ ...this.state, schedule: this.state.schedule.replace(schedule, today, because) });
	}

	correctSchedule(schedule: Schedule): Habit {
		return new Habit({ ...this.state, schedule: this.state.schedule.correct(schedule) });
	}

	withOrder(order: number): Habit {
		return new Habit({ ...this.state, order });
	}

	withColor(color: HabitColor | undefined): Habit {
		return new Habit({ ...this.state, color });
	}

	archive(): Habit {
		return new Habit({ ...this.state, archived: true });
	}

	restore(): Habit {
		return new Habit({ ...this.state, archived: false });
	}

	changes(): RecipeChange[] {
		const created = this.createdOn;
		const collect = <T>(
			versions: readonly Version<T>[],
			build: (version: Version<T>, previous?: Version<T>) => RecipeChange,
		): RecipeChange[] =>
			versions.flatMap((version, index) => {
				const previous = versions[index + 1];
				if (!previous && version.since.equals(created)) return [];
				return [build(version, previous)];
			});
		const text = TEXT_PARTS.flatMap((part) =>
			collect(this.state.text[part].versions, (version, previous) => ({
				part,
				date: version.since,
				from: previous?.value,
				to: version.value,
				because: previous?.replacedBecause,
			})),
		);
		const schedule = collect(this.state.schedule.versions, (version, previous) => ({
			part: "schedule" as const,
			date: version.since,
			from: previous?.value,
			to: version.value,
			because: previous?.replacedBecause,
		}));
		return [...text, ...schedule].sort((a, b) => b.date.compare(a.date));
	}

	private withText(part: TextPart, component: Component<string>): Habit {
		return new Habit({ ...this.state, text: { ...this.state.text, [part]: component } });
	}
}
