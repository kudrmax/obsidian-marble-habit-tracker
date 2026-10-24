import { Box } from "./jar/JarPhysics";

const NAVBAR = ".mobile-navbar";
/** The desktop status bar in the bottom right corner. */
const STATUS_BAR = ".status-bar";
const HEADER_PARTS = ".view-header .view-header-left .view-action, .view-header .view-actions";

/**
 * Tracks the floating parts of Obsidian's UI over the element — the phone navbar and the desktop status bar below, the
 * header buttons above. The navbar and the status bar are shelves for every win; the header buttons only stop wins that
 * already landed, so the jar can fill from the top.
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
		const statusBar = document.querySelector<HTMLElement>(STATUS_BAR);
		const parts = [...this.header.querySelectorAll<HTMLElement>(HEADER_PARTS)];
		this.track([navbar, statusBar, ...parts].filter((element): element is HTMLElement => element !== null));
		const shelf = navbar ? this.box(navbar) : null;
		const bar = statusBar ? this.box(statusBar) : null;
		const shelves = [shelf, bar].filter((box): box is Box => box !== null);
		const ledges = parts.flatMap((part) => this.box(part) ?? []);
		const key = JSON.stringify([shelves, ledges]);
		if (key === this.last) return;
		this.last = key;
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
			radius: Math.min(parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0, box.width / 2, box.height / 2),
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
