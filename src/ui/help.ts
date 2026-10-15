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
		{ action: `${tap} a habit's name`, result: `Opens it: pick the tiny action, the full one or skipped, each with its own words, and see the rest of the recipe and its note. The full one on a habit with a tiny version draws a second ring around the circle.` },
		{ action: mobile ? "Hold the circle" : "Right-click or hold the circle", result: "A shortcut to the same answers." },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "Drag the sheet", result: "Pull it up to see the whole day; the jar's floor rises with it. Pull it down to bring the jar back." },
		{ action: "‹ › next to the day", result: "Step back to mark a day you forgot." },
		{ action: "Done · skipped", result: "Answered habits fold into this row under the list. Show opens them to change an answer." },
		{ action: "All habits, under the list", result: "Shows all habits, with the ones not due today and the archived ones." },
		{ action: "Marbles", result: `Every win drops a marble. ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
