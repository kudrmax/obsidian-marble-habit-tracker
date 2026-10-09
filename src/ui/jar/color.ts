export interface Hsl {
	readonly h: number;
	readonly s: number;
	readonly l: number;
}

const HEX = /^#?([0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i;

export function parseColor(value: string): Hsl | null {
	const text = value.trim();
	const hex = HEX.exec(text);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return fromRgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
	}
	const rgb = RGB.exec(text);
	return rgb ? fromRgb(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) : null;
}

export function hsl(color: Hsl, shift: Partial<Hsl> = {}, alpha?: number): string {
	const clamp = (value: number) => Math.max(0, Math.min(100, value));
	const h = (((color.h + (shift.h ?? 0)) % 360) + 360) % 360;
	const s = clamp(color.s + (shift.s ?? 0));
	const l = clamp(color.l + (shift.l ?? 0));
	const tail = alpha === undefined ? "" : ` / ${alpha}`;
	return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%${tail})`;
}

function fromRgb(red: number, green: number, blue: number): Hsl {
	const r = red / 255;
	const g = green / 255;
	const b = blue / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: l * 100 };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	return { h, s: s * 100, l: l * 100 };
}
