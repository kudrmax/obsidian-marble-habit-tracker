import { describe, expect, it } from "vitest";
import { helpRows } from "../src/ui/help";

describe("helpRows", () => {
	const merge = { smallPerMedium: 7, mediumPerBig: 4 };

	it("names the gestures of the device", () => {
		expect(helpRows(true, merge).map((row) => row.action)).toContain("Hold the circle");
		expect(helpRows(false, merge).map((row) => row.action)).toContain("Right-click or hold the circle");
		expect(helpRows(true, merge).map((row) => row.action)).toContain("Tilt the phone");
		expect(helpRows(false, merge).map((row) => row.action)).toContain("Move the mouse");
	});

	it("takes the merge counts from settings", () => {
		const marbles = helpRows(true, { smallPerMedium: 5, mediumPerBig: 3 }).find((row) => row.action === "Marbles");
		expect(marbles?.result).toContain("5 small ones merge into a medium, 3 medium into a big");
	});
});
