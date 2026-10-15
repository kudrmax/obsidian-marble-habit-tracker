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
		{ action: "Done", result: "The card at the top holds the habit to do now. Done marks it — the tiny action if it has one — and the next habit takes its place. ✦ marks the full action, ✕ skips." },
		{ action: `${tap} the circle`, result: `Marks a habit in the list done. ${tap} again to undo.` },
		{ action: mobile ? "Hold the circle" : "Right-click or hold the circle", result: "A menu: Tiny action, Action or Skipped, and the recipe." },
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
