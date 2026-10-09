import { DomainError } from "./DomainError";

export type DayMark =
	| { readonly kind: "tiny" }
	| { readonly kind: "full" }
	| { readonly kind: "missed"; readonly reason: string };

export const TINY: DayMark = { kind: "tiny" };
export const FULL: DayMark = { kind: "full" };

export function missed(reason: string): DayMark {
	const text = reason.trim();
	if (!text) throw new DomainError("Write down a reason");
	return { kind: "missed", reason: text };
}

export function isDone(mark?: DayMark): boolean {
	return mark?.kind === "tiny" || mark?.kind === "full";
}

export function nextMark(mark: DayMark | undefined): DayMark | undefined {
	if (mark === undefined) return TINY;
	if (mark.kind === "tiny") return FULL;
	if (mark.kind === "full") return undefined;
	throw new DomainError("A missed day is changed from its reason window");
}
