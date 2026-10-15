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
		{ action: `${tap} the circle`, result: `The row turns into its answers: the tiny action, the full one, or skip. ${tap} one and the habit moves into the done line; ✕ brings the row back. The full one on a habit with a tiny version draws a second ring around the circle. ${tap} the answer a marked habit already has to clear it.` },
		{ action: `${tap} a habit's name`, result: `Opens its recipe, with a link to its note. ${tap} again to close it.` },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "Drag the sheet", result: "Pull it up to see the whole day; the jar's floor rises with it. Pull it down to bring the jar back." },
		{ action: "‹ › next to the day", result: "Step back to mark a day you forgot." },
		{ action: "Done · skipped", result: "Answered habits fold into this row under the list. Show opens them to change an answer." },
		{ action: "All habits, under the list", result: "Shows all habits, with the ones not due today and the archived ones." },
		{ action: "Marbles", result: `Every win drops a marble. ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
