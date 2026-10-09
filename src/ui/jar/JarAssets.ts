import { JarSize } from "../../domain/Jar";
import { Hsl, hsl } from "./color";

export const JAR_MATERIALS = ["grain", "aura", "halftone"] as const;
export type JarMaterial = (typeof JAR_MATERIALS)[number];

export const JAR_DIAMETER: Record<JarSize, number> = { small: 24, medium: 44, big: 68 };

export interface AssetSpec {
	readonly material: JarMaterial;
	readonly color: Hsl;
	readonly background: Hsl;
	readonly size: JarSize;
	readonly full: boolean;
}

const STAR = "M0 -10 C1.2 -2.6 2.6 -1.2 10 0 C2.6 1.2 1.2 2.6 0 10 C-1.2 2.6 -2.6 1.2 -10 0 C-2.6 -1.2 -1.2 -2.6 0 -10 Z";
const SHADOW_SIDE = "M-60 26 C-14 48 34 22 60 -36 L60 60 L-60 60 Z";

export function isJarMaterial(value: unknown): value is JarMaterial {
	return JAR_MATERIALS.includes(value as JarMaterial);
}

export function assetKey(spec: AssetSpec): string {
	return [spec.material, hsl(spec.color), hsl(spec.background), spec.size, spec.full ? "full" : "tiny"].join("|");
}

export function assetSvg(spec: AssetSpec, pixels: number): string {
	const { color } = spec;
	const star = (fill: string, scale: number) => `<path d="${STAR}" transform="scale(${scale})" fill="${fill}"/>`;
	const spark = spec.full ? `<path d="${STAR}" transform="translate(20 -20) scale(0.9)" fill="#ffffff"/>` : "";
	const big = spec.size === "big";
	let defs = '<clipPath id="ball"><circle r="48"/></clipPath>';
	let body: string;
	if (spec.material === "aura") {
		defs += `<radialGradient id="aura" cx="50%" cy="50%" r="80%" fx="32%" fy="26%"><stop offset="0" stop-color="${hsl(color, { h: -16, l: 16 })}"/><stop offset="0.6" stop-color="${hsl(color, { s: 6 })}"/><stop offset="1" stop-color="${hsl(color, { h: 16, s: 8, l: -14 })}"/></radialGradient>`;
		body = `<circle r="48" fill="url(#aura)"/>${big ? star("#ffffff", 1.8) : ""}`;
	} else if (spec.material === "halftone") {
		defs += '<pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3" cy="3" r="1.9" fill="#ffffff"/></pattern>';
		defs += '<radialGradient id="light" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#000000"/></radialGradient>';
		defs += '<mask id="lit"><circle r="48" fill="url(#light)"/></mask>';
		body = `<circle r="48" fill="${hsl(color, { l: -10 })}"/><g clip-path="url(#ball)"><rect x="-60" y="-60" width="120" height="120" fill="url(#dots)" mask="url(#lit)" opacity="0.75"/></g>${big ? star("#ffffff", 2) : ""}`;
	} else {
		defs += '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -0.55"/></filter>';
		body = `<circle r="48" fill="${hsl(color)}"/><g clip-path="url(#ball)"><path d="${SHADOW_SIDE}" fill="${hsl(color, { l: -15 })}"/><rect x="-48" y="-48" width="96" height="96" filter="url(#grain)" opacity="0.22"/></g>${big ? star(hsl(spec.background), 2.4) : ""}`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="-48 -48 96 96"><defs>${defs}</defs>${body}${spark}</svg>`;
}
