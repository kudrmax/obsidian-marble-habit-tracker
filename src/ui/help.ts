import { MergeRule } from "../domain/Jar";

export interface HelpRow {
	readonly action: string;
	readonly result: string;
}

/**
 * Everything Today does that can't be seen until tried, as shown behind its "?" button.
 * Keep it in step with Today: a new gesture, or a changed one, belongs here.
 */
export function helpRows(mobile: boolean, merge: MergeRule): HelpRow[] {
	return [
		{ action: "Tap the circle", result: "Marks the habit done — the tiny action if it has one. Tap again to undo." },
		{ action: mobile ? "Hold the circle" : "Right-click or hold the circle", result: "Choose Action, Tiny action or Skipped." },
		{ action: "Tap a habit", result: "Opens its note." },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "‹ Today ›", result: "Steps back to mark a day you forgot." },
		{ action: "List button", result: "Shows all habits, with the ones not due today and the archived ones." },
		{ action: "Marbles", result: `Every win drops a marble. ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
