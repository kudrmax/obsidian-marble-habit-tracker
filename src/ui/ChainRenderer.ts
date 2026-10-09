import { ChainLayout } from "./chainLayout";
import { parseChainMetrics } from "./chainMetrics";

const SVG_NS = "http://www.w3.org/2000/svg";
export const SPARK_PATH = "M0 -6 C0.8 -1.6 1.6 -0.8 6 0 C1.6 0.8 0.8 1.6 0 6 C-0.8 1.6 -1.6 0.8 -6 0 C-1.6 -0.8 -0.8 -1.6 0 -6 Z";
export const SPARK_PATH_SIZE = 12;
const GOO_MATRIX = "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11";

let nextId = 0;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
	const element = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
	return element;
}

export function drawChain(host: HTMLElement, days: number, layout: ChainLayout): SVGSVGElement | null {
	const style = getComputedStyle(host);
	const metrics = parseChainMetrics((token) => style.getPropertyValue(token));
	if (!metrics) return null;
	const id = `th-chain-${nextId++}`;
	const width = days * metrics.cell;
	const cy = metrics.row / 2;
	const radius = metrics.bead / 2;
	const center = (index: number) => index * metrics.cell + metrics.cell / 2;

	const root = svg("svg", { class: "th-chain", width, height: metrics.row, viewBox: `0 0 ${width} ${metrics.row}` });
	const defs = svg("defs", {});
	const goo = svg("filter", { id: `${id}-goo`, x: "-5%", y: "-50%", width: "110%", height: "200%", "color-interpolation-filters": "sRGB" });
	goo.append(
		svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: metrics.blur, result: "blur" }),
		svg("feColorMatrix", { in: "blur", mode: "matrix", values: GOO_MATRIX }),
	);
	defs.append(goo);
	root.append(defs);

	layout.runs.forEach((run, runIndex) => {
		const gradientId = `${id}-run-${runIndex}`;
		const gradient = svg("linearGradient", {
			id: gradientId,
			gradientUnits: "userSpaceOnUse",
			x1: center(run.first) - radius,
			x2: center(run.last) + radius,
			y1: 0,
			y2: 0,
		});
		gradient.append(
			svg("stop", { offset: 0, class: "th-chain-start" }),
			svg("stop", { offset: 1, class: run.first === run.last ? "th-chain-start" : "th-chain-end" }),
		);
		defs.append(gradient);
		const group = svg("g", { class: "th-chain-run", filter: `url(#${id}-goo)`, fill: `url(#${gradientId})` });
		run.beads.forEach((bead, beadIndex) => {
			group.append(svg("circle", { cx: center(bead.index), cy, r: radius }));
			if (beadIndex < run.beads.length - 1) {
				group.append(svg("rect", { x: center(bead.index), y: cy - metrics.neck / 2, width: metrics.cell, height: metrics.neck }));
			}
		});
		root.append(group);
	});

	for (const run of layout.runs) {
		for (const bead of run.beads) {
			if (!bead.spark) continue;
			const scale = metrics.spark / SPARK_PATH_SIZE;
			root.append(svg("path", { class: "th-spark", d: SPARK_PATH, transform: `translate(${center(bead.index)} ${cy}) scale(${scale})` }));
		}
	}
	for (const ring of layout.rings) {
		const cls = ring.kind === "missed" ? "th-ring th-ring-missed" : "th-ring";
		root.append(svg("circle", { class: cls, cx: center(ring.index), cy, r: radius - metrics.ring / 2 }));
	}
	return root;
}
