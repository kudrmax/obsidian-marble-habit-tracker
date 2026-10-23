import { describe, expect, it } from "vitest";
import { AssetSpec, assetKey, assetSvg, floorScale, isJarMaterial, scaleSizes } from "../src/ui/jar/JarAssets";
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

describe("floorScale", () => {
	it("keeps the marbles' size on a phone-like floor and grows them on a wide one, up to half again", () => {
		expect(floorScale(402)).toBe(1);
		expect(floorScale(730)).toBe(1);
		expect(floorScale(1095)).toBeCloseTo(1.5);
		expect(floorScale(2400)).toBe(1.5);
	});

	it("scales every size and keeps them whole pixels", () => {
		expect(scaleSizes({ small: 24, medium: 44, big: 68 }, 1.5)).toEqual({ small: 36, medium: 66, big: 102 });
		expect(scaleSizes({ small: 25, medium: 44, big: 68 }, 1.1)).toEqual({ small: 28, medium: 48, big: 75 });
	});
});

describe("isJarMaterial", () => {
	it("accepts only known materials", () => {
		expect(isJarMaterial("halftone")).toBe(true);
		expect(isJarMaterial("clay")).toBe(false);
	});
});
