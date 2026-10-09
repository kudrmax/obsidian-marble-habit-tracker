import { Pill } from "./jar/JarPhysics";

const NAVBAR = ".mobile-navbar";

/**
 * Tracks the floating mobile navbar over the element: keeps --th-bottom-inset equal to how much of
 * the element it covers and reports its shape so the jar can treat it as a shelf.
 */
export class BottomInset {
	private readonly resizer = new ResizeObserver(() => this.measure());
	private readonly mutations = new MutationObserver(() => this.measure());
	private readonly onTransition = () => this.measure();
	private navbar: HTMLElement | null = null;
	private last = "";

	constructor(
		private readonly element: HTMLElement,
		private readonly onShelf: (shelf: Pill | null) => void,
	) {
		this.resizer.observe(element);
		this.mutations.observe(document.body, { attributes: true, attributeFilter: ["class"] });
		this.measure();
	}

	measure(): void {
		this.track(document.querySelector<HTMLElement>(NAVBAR));
		const shelf = this.shelf();
		const inset = shelf ? Math.max(0, Math.ceil(this.element.getBoundingClientRect().height - (shelf.y - shelf.radius))) : 0;
		const key = JSON.stringify([shelf, inset]);
		if (key === this.last) return;
		this.last = key;
		this.element.style.setProperty("--th-bottom-inset", `${inset}px`);
		this.onShelf(shelf);
	}

	destroy(): void {
		this.resizer.disconnect();
		this.mutations.disconnect();
		this.track(null);
	}

	private shelf(): Pill | null {
		const navbar = this.navbar;
		if (!navbar || navbar.getClientRects().length === 0) return null;
		const area = this.element.getBoundingClientRect();
		const box = navbar.getBoundingClientRect();
		if (box.top >= area.bottom || box.bottom <= area.top || box.height === 0) return null;
		const radius = box.height / 2;
		const left = box.left - area.left + radius;
		const right = box.right - area.left - radius;
		return { left, right: Math.max(left, right), y: box.top - area.top + radius, radius };
	}

	private track(navbar: HTMLElement | null): void {
		if (navbar === this.navbar) return;
		if (this.navbar) {
			this.resizer.unobserve(this.navbar);
			this.navbar.removeEventListener("transitionend", this.onTransition);
		}
		this.navbar = navbar;
		if (!navbar) return;
		this.resizer.observe(navbar);
		navbar.addEventListener("transitionend", this.onTransition);
	}
}
