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
		{ action: `${tap} the circle`, result: `The answers slide in from the left as buttons with a word — Full, Tiny, Skip — and take the row while the name fades: the habit's color with a check for the full action, a tint of it with a check for the tiny one, grey with a dash for skip. ${tap} one and the circle stays looking like that answer as the habit leaves the list; ✕, where the circle was, brings the row back at any moment. ${tap} the circle of a marked habit to clear the mark.` },
		{ action: `${tap} a habit's name`, result: `Opens its recipe, with a link to its note. ${tap} again to close it.` },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "Pull the sheet down", result: `Shows your days as columns, each filled with how much of that day was done. The sheet stays wherever you let it go. ${tap} a day to mark it; ${mobile ? "swipe" : "scroll or drag"} the days sideways to go further back. Push the sheet up to bring the habits back.` },
		{ action: "✓ and a number", result: `How many answered habits are hidden. ${tap} it to show them and change an answer, and again to hide them.` },
		{ action: "The day above the list", result: "On a past day it says which one; its ✕ goes back to today." },
		{ action: "The list button", result: "Shows all habits, with the ones not due today and the archived ones." },
		{ action: "Marbles", result: `Every win drops a marble. ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
