import { describe, expect, it } from "vitest";
import { AssetSpec, assetKey, assetSvg, isJarMaterial } from "../src/ui/jar/JarAssets";
import { hsl, parseColor } from "../src/ui/jar/color";

const purple = parseColor("#a882ff")!;
const background = parseColor("#1e1e1e")!;
const spec = (patch: Partial<AssetSpec> = {}): AssetSpec => ({ material: "grain", color: purple, background, size: "small", full: false, ...patch });

describe("parseColor", () => {
	it("reads hex and rgb colors", () => {
		expect(hsl(parseColor("#ff0000")!)).toBe("hsl(0 100% 50%)");
		expect(hsl(parseColor("rgb(0, 0, 255)")!)).toBe("hsl(240 100% 50%)");
		expect(hsl(parseColor("rgba(0 255 0 / 0.5)")!)).toBe("hsl(120 100% 50%)");
	});

	it("rejects anything else", () => {
		expect(parseColor("purple")).toBeNull();
	});

	it("shifts and clamps", () => {
		expect(hsl(parseColor("#ff0000")!, { h: -20, l: 60 })).toBe("hsl(340 100% 100%)");
	});
});

describe("assetSvg", () => {
	it("draws grain with a shadow side and grain", () => {
		const svg = assetSvg(spec(), 48);
		expect(svg).toContain('width="48"');
		expect(svg).toContain("feTurbulence");
		expect(svg).not.toContain("scale(2.4)");
	});

	it("puts a star on big balls and a spark on full days", () => {
		expect(assetSvg(spec({ size: "big" }), 68)).toContain("scale(2.4)");
		expect(assetSvg(spec({ full: true }), 24)).toContain("translate(20 -20)");
	});

	it("draws aura as a gradient and halftone as dots", () => {
		expect(assetSvg(spec({ material: "aura" }), 24)).toContain("radialGradient");
		expect(assetSvg(spec({ material: "halftone" }), 24)).toContain('pattern id="dots"');
	});

	it("keys every variant separately", () => {
		expect(assetKey(spec())).not.toBe(assetKey(spec({ full: true })));
		expect(assetKey(spec())).not.toBe(assetKey(spec({ material: "aura" })));
	});
});

describe("isJarMaterial", () => {
	it("accepts only known materials", () => {
		expect(isJarMaterial("halftone")).toBe(true);
		expect(isJarMaterial("clay")).toBe(false);
	});
});
