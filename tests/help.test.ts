import { describe, expect, it } from "vitest";
import { helpRows } from "../src/ui/help";

describe("helpRows", () => {
	const merge = { smallPerMedium: 7, mediumPerBig: 4 };

	it("names the gestures of the device", () => {
		expect(helpRows(true, merge).map((row) => row.action)).toContain("Tilt the phone");
		expect(helpRows(false, merge).map((row) => row.action)).toContain("Move the mouse");
		expect(helpRows(true, merge).map((row) => row.action)).toContain("Tap the circle");
		expect(helpRows(false, merge).map((row) => row.action)).toContain("Click the circle");
	});

	it("tells a phone to pull the days up and a computer that its week is over the list", () => {
		const phone = helpRows(true, merge).map((row) => row.action);
		const computer = helpRows(false, merge).map((row) => row.action);
		expect(phone).toContain("Pull the days up");
		expect(computer).toContain("The week above the list");
		expect(computer).not.toContain("Pull the days up");
	});

	it("takes the merge counts from settings", () => {
		const marbles = helpRows(true, { smallPerMedium: 5, mediumPerBig: 3 }).find((row) => row.action === "Marbles");
		expect(marbles?.result).toContain("5 small ones merge into a medium, 3 medium into a big");
	});

	it("names the answer for a day done not at the trigger only when it is turned on, with the trigger's label", () => {
		const circle = (rows: ReturnType<typeof helpRows>) => rows.find((row) => row.action === "Tap the circle")?.result;
		const marbles = (rows: ReturnType<typeof helpRows>) => rows.find((row) => row.action === "Marbles")?.result;
		expect(circle(helpRows(true, merge))).not.toContain("Anytime");
		const strict = helpRows(true, merge, { trigger: "cue", win: false });
		expect(circle(strict)).toContain("Full, Tiny, Skip, and Anytime for a habit that may be done without its cue —");
		expect(circle(strict)).toContain("not at the cue");
		expect(marbles(strict)).toContain("A day done not at the cue drops none.");
		expect(marbles(helpRows(true, merge, { trigger: "cue", win: true }))).toContain("A day done not at the cue is a win too.");
	});
});
