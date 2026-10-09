import { describe, expect, it } from "vitest";
import { ScrollAnchor } from "../src/ui/ScrollAnchor";

describe("ScrollAnchor", () => {
	it("starts pinned to the right edge, where today is", () => {
		expect(new ScrollAnchor().scrollLeft({ scrollWidth: 2160, clientWidth: 700 })).toBe(1460);
	});

	it("keeps the distance from the right edge when content grows", () => {
		const anchor = new ScrollAnchor();
		anchor.remember({ scrollLeft: 1000, scrollWidth: 2160, clientWidth: 700 });
		expect(anchor.scrollLeft({ scrollWidth: 4320, clientWidth: 700 })).toBe(3160);
	});

	it("ignores measurements of a hidden scroller", () => {
		const anchor = new ScrollAnchor();
		anchor.remember({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
		expect(anchor.scrollLeft({ scrollWidth: 2160, clientWidth: 700 })).toBe(1460);
	});
});
