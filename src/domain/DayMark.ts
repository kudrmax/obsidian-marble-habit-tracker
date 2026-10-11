import { DomainError } from "./DomainError";

/** `offTrigger`: done, but not right after the anchor. */
export type DayMark =
	| { readonly kind: "tiny"; readonly offTrigger?: true }
	| { readonly kind: "full"; readonly offTrigger?: true }
	| { readonly kind: "missed"; readonly reason: string };

export const TINY: DayMark = { kind: "tiny" };
export const FULL: DayMark = { kind: "full" };

export function done(kind: "tiny" | "full", offTrigger: boolean): DayMark {
	return offTrigger ? { kind, offTrigger: true } : { kind };
}

export function isOffTrigger(mark?: DayMark): boolean {
	return mark?.kind !== "missed" && mark?.offTrigger === true;
}

export function missed(reason: string): DayMark {
	const text = reason.trim();
	if (!text) throw new DomainError("Write down a reason");
	return { kind: "missed", reason: text };
}

export function isDone(mark?: DayMark): boolean {
	return mark?.kind === "tiny" || mark?.kind === "full";
}
