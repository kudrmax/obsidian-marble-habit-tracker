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
	const tap = mobile ? "Tap" : "Click";
	return [
		{ action: `${tap} the circle`, result: `Marks the habit done — the tiny action if it has one. ${tap} again to undo.` },
		{ action: mobile ? "Hold the circle" : "Right-click or hold the circle", result: "Choose Action, Tiny action or Skipped." },
		{ action: `${tap} a habit`, result: `Opens its recipe, with a link to its note. ${tap} again to close it.` },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "‹ › next to the day", result: "Step back to mark a day you forgot." },
		{ action: "Done · skipped", result: "Answered habits fold into this line under the list. Open it to change an answer." },
		{ action: "List button above the day", result: "Shows all habits, with the ones not due today and the archived ones." },
		{ action: "Marbles", result: `Every win drops a marble. ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
