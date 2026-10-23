import { MergeRule } from "../domain/Jar";

export interface HelpRow {
	readonly action: string;
	readonly result: string;
}

/** The answer for a day done not at the trigger, when the settings turn it on. */
export interface OffTriggerHelp {
	/** What the trigger is called in the settings. */
	readonly trigger: string;
	readonly win: boolean;
}

/**
 * Everything Today does that can't be seen until tried, as shown behind its "?" button.
 * Keep it in step with Today: a new gesture, or a changed one, belongs here.
 */
export function helpRows(mobile: boolean, merge: MergeRule, offTrigger: OffTriggerHelp | null = null): HelpRow[] {
	const tap = mobile ? "Tap" : "Click";
	const words = offTrigger ? `Full, Tiny, Skip, and Anytime for a habit that may be done without its ${offTrigger.trigger}` : "Full, Tiny, Skip";
	const off = offTrigger ? ` grey with a check of its color for a day done not at the ${offTrigger.trigger},` : "";
	const offWin = offTrigger ? ` A day done not at the ${offTrigger.trigger} ${offTrigger.win ? "is a win too" : "drops none"}.` : "";
	return [
		{ action: `${tap} the circle`, result: `The answers slide in from the left as buttons with a word — ${words} — and take the row while the name fades: the habit's color with a check for the full action, a tint of it with a check for the tiny one,${off} grey with a dash for skip. ${tap} one and the circle stays looking like that answer as the habit leaves the list; ✕, where the circle was, brings the row back at any moment. ${tap} the circle of a marked habit to clear the mark.` },
		{ action: `${tap} a habit's name`, result: `Opens its recipe — the same fields as in its note, changed in place — with a link to the note. ${tap} again to close it.` },
		{ action: mobile ? "Hold and drag a habit" : "Drag a habit", result: "Reorders habits. Drop it on “+ New section” to group them." },
		{ action: "Pull the days up", result: `The bar at the bottom shows this week. Pull it up and the rest of the month comes in above it, each day in a ring of how much of it was done. Let go, it stays on the nearest whole week. The arrows by the month open the months before. The marbles stand on the bar and ride it up. ${tap} a day to mark it. Push the bar down to put the days away.` },
		{ action: "✓ and a number", result: `How many answered habits are hidden. ${tap} it to show them and change an answer, and again to hide them.` },
		{ action: "The day above the list", result: "On a past day it says which one; its ✕ goes back to today." },
		{ action: "The list button", result: `Shows all habits, with the ones not due today and the archived ones. The days stay under them; ${tap.toLowerCase()} one to go back to Today on that day.` },
		{ action: "Marbles", result: `Every win drops a marble.${offWin} ${merge.smallPerMedium} small ones merge into a medium, ${merge.mediumPerBig} medium into a big.` },
		{ action: mobile ? "Tilt the phone" : "Move the mouse", result: "Rolls the marbles." },
	];
}
