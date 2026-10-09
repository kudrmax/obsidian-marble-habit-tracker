const NAVBAR = ".mobile-navbar";
const GAP = 8;

/** Keeps --th-bottom-inset equal to how much of the element the floating mobile navbar covers. */
export class BottomInset {
	private readonly resizer = new ResizeObserver(() => this.measure());
	private readonly mutations = new MutationObserver(() => this.measure());
	private readonly onTransition = () => this.measure();
	private navbar: HTMLElement | null = null;
	private inset = -1;

	constructor(private readonly element: HTMLElement) {
		this.resizer.observe(element);
		this.mutations.observe(document.body, { attributes: true, attributeFilter: ["class"] });
		this.measure();
	}

	measure(): void {
		this.track(document.querySelector<HTMLElement>(NAVBAR));
		const inset = this.covered();
		if (inset === this.inset) return;
		this.inset = inset;
		this.element.style.setProperty("--th-bottom-inset", `${inset}px`);
	}

	destroy(): void {
		this.resizer.disconnect();
		this.mutations.disconnect();
		this.track(null);
	}

	private covered(): number {
		const navbar = this.navbar;
		if (!navbar || navbar.getClientRects().length === 0) return 0;
		const overlap = this.element.getBoundingClientRect().bottom - navbar.getBoundingClientRect().top;
		return overlap > 0 ? Math.ceil(overlap) + GAP : 0;
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
