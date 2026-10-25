import { HabitEntry } from "../application/ports";
import { DayMark, sameMark } from "../domain/DayMark";
import { LocalDate } from "../domain/LocalDate";

/** How long a chosen mark is shown over its note, should Obsidian never read the note back with it. */
const PENDING_TTL_MS = 4000;

interface Pending {
	readonly path: string;
	readonly day: LocalDate;
	readonly mark: DayMark | undefined;
	readonly at: number;
}

/**
 * Marks just chosen, shown at once: the note is written a moment later, and Obsidian reads it back later still. A mark
 * is let go once the note says the same, after a while, or when the note could not be written.
 */
export class PendingMarks {
	private readonly marks = new Map<string, Pending>();

	constructor(private readonly now: () => number = Date.now) {}

	set(path: string, day: LocalDate, mark: DayMark | undefined): void {
		this.marks.set(key(path, day), { path, day, mark, at: this.now() });
	}

	drop(path: string, day: LocalDate): void {
		this.marks.delete(key(path, day));
	}

	/** The habits as they will read once their notes are written. */
	apply(entries: readonly HabitEntry[], today: LocalDate): HabitEntry[] {
		if (this.marks.size === 0) return [...entries];
		const now = this.now();
		return entries.map((entry) => {
			if (entry.kind !== "ok") return entry;
			let habit = entry.habit;
			for (const [id, pending] of this.marks) {
				if (pending.path !== entry.path) continue;
				if (now - pending.at > PENDING_TTL_MS || sameMark(habit.markOn(pending.day), pending.mark)) this.marks.delete(id);
				else habit = habit.withMark(pending.day, pending.mark, today);
			}
			return habit === entry.habit ? entry : { ...entry, habit };
		});
	}
}

function key(path: string, day: LocalDate): string {
	return `${path}|${day.toString()}`;
}
