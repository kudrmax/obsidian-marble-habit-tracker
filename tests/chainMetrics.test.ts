import { describe, expect, it } from "vitest";
import { parseChainMetrics } from "../src/ui/chainMetrics";

const tokens: Record<string, string> = {
	"--th-cell": "36px",
	"--th-row": "56px",
	"--th-bead": "24px",
	"--th-neck": "13px",
	"--th-spark": "12px",
	"--th-ring-width": "1.5px",
	"--th-goo-blur": "3.4",
};

describe("parseChainMetrics", () => {
	it("reads chain sizes from the design tokens", () => {
		expect(parseChainMetrics((name) => tokens[name] ?? "")).toEqual({ cell: 36, row: 56, bead: 24, neck: 13, spark: 12, ring: 1.5, blur: 3.4 });
	});

	it("reports that styles are not loaded yet when a token is missing", () => {
		expect(parseChainMetrics((name) => (name === "--th-row" ? "" : tokens[name]))).toBeNull();
	});
});
