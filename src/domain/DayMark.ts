/** A day is done tiny or full, done not at the trigger, or skipped. A skipped day may say why. */
export type DayMark =
	| { readonly kind: "tiny" }
	| { readonly kind: "full" }
	| { readonly kind: "offTrigger" }
	| { readonly kind: "missed"; readonly reason?: string };

export const TINY: DayMark = { kind: "tiny" };
export const FULL: DayMark = { kind: "full" };
export const OFF_TRIGGER: DayMark = { kind: "offTrigger" };
export const SKIPPED: DayMark = { kind: "missed" };

export function missed(reason?: string): DayMark {
	const text = reason?.trim();
	return text ? { kind: "missed", reason: text } : SKIPPED;
}

export function sameMark(a: DayMark | undefined, b: DayMark | undefined): boolean {
	if (a?.kind === "missed" && b?.kind === "missed") return a.reason === b.reason;
	return a?.kind === b?.kind;
}

/** Which days are wins: they drop a marble, grow the streak and fill the day's ring. Tiny and full always are. */
export interface WinRule {
	readonly offTrigger: boolean;
}

export const DEFAULT_WIN_RULE: WinRule = { offTrigger: false };

export function isWin(mark: DayMark | undefined, rule: WinRule): boolean {
	if (mark?.kind === "offTrigger") return rule.offTrigger;
	return mark?.kind === "tiny" || mark?.kind === "full";
}
