import { Box } from "./jar/JarPhysics";

const NAVBAR = ".mobile-navbar";
const HEADER_PARTS = ".view-header .view-header-left .view-action, .view-header .view-actions";

/**
 * Tracks the floating parts of Obsidian's phone UI over the element — the navbar below and the
 * header buttons above — keeps --th-bottom-inset equal to how much the navbar covers. The navbar is
 * a shelf for every win; the header buttons only stop wins that already landed, so the jar can fill from the top.
 */
export class ScreenChrome {
	private readonly resizer = new ResizeObserver(() => this.measure());
	private readonly mutations = new MutationObserver(() => this.measure());
	private readonly onTransition = () => this.measure();
	private tracked: HTMLElement[] = [];
	private last = "";

	constructor(
		private readonly element: HTMLElement,
		private readonly header: HTMLElement,
		private readonly onChange: (shelves: Box[], ledges: Box[]) => void,
	) {
		this.resizer.observe(element);
		this.mutations.observe(document.body, { attributes: true, attributeFilter: ["class"] });
		this.measure();
	}

	measure(): void {
		const navbar = document.querySelector<HTMLElement>(NAVBAR);
		const parts = [...this.header.querySelectorAll<HTMLElement>(HEADER_PARTS)];
		this.track(navbar ? [navbar, ...parts] : parts);
		const shelf = navbar ? this.box(navbar) : null;
		const shelves = shelf ? [shelf] : [];
		const ledges = parts.flatMap((part) => this.box(part) ?? []);
		const inset = shelf ? Math.max(0, Math.ceil(this.element.getBoundingClientRect().height - shelf.top)) : 0;
		const key = JSON.stringify([shelves, ledges, inset]);
		if (key === this.last) return;
		this.last = key;
		this.element.style.setProperty("--th-bottom-inset", `${inset}px`);
		this.onChange(shelves, ledges);
	}

	destroy(): void {
		this.resizer.disconnect();
		this.mutations.disconnect();
		this.track([]);
	}

	private box(target: HTMLElement): Box | null {
		if (target.getClientRects().length === 0) return null;
		const area = this.element.getBoundingClientRect();
		const box = target.getBoundingClientRect();
		if (box.top >= area.bottom || box.bottom <= area.top || box.width === 0 || box.height === 0) return null;
		return {
			left: box.left - area.left,
			top: box.top - area.top,
			right: box.right - area.left,
			bottom: box.bottom - area.top,
			radius: Math.min(box.width, box.height) / 2,
		};
	}

	private track(elements: HTMLElement[]): void {
		const same = elements.length === this.tracked.length && elements.every((element, index) => element === this.tracked[index]);
		if (same) return;
		for (const element of this.tracked) {
			this.resizer.unobserve(element);
			element.removeEventListener("transitionend", this.onTransition);
		}
		this.tracked = elements;
		for (const element of elements) {
			this.resizer.observe(element);
			element.addEventListener("transitionend", this.onTransition);
		}
	}
}
