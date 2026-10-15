import { SETTLE } from "./Motion";

/** Where the sheet rests: halfway, with the jar on show above it, or pulled up, with the jar squeezed into a strip. */
export type Detent = "half" | "full";

/** The share of the screen above the sheet when it rests halfway. */
const HALF = 0.46;
/** How much of the jar stays in sight above a pulled-up sheet, under the number. */
const FULL_STAGE = 128;
/** A flick faster than this, in px per ms, picks the detent it heads to whatever the position. */
const FLICK = 0.45;
/** Past a detent the sheet follows the finger at this fraction, like iOS rubber-banding. */
const RUBBER = 0.35;
const SETTLE_MS = 420;

/**
 * Today's two layers, as in Maps or Find My: a stage on top with the number and the jar, and a sheet over it that
 * holds the day. The sheet is dragged by its grip between two detents; its top edge is the jar's floor, so pulling it
 * up pushes the marbles up. Everything that depends on the sheet's position hears about it through `onMove`.
 */
export class TodaySheet {
	readonly stage: HTMLElement;
	readonly hero: HTMLElement;
	readonly sheet: HTMLElement;
	readonly grip: HTMLElement;
	/** The sheet's own header under the grabber, redrawn with the day; dragging it moves the sheet too. */
	readonly head: HTMLElement;
	readonly scroll: HTMLElement;
	private detent: Detent = "half";
	private top = 0;
	private drag: { pointer: number; startY: number; startTop: number; lastY: number; lastAt: number; speed: number } | null = null;
	private settleFrame = 0;
	private readonly resizer: ResizeObserver;

	constructor(
		private readonly root: HTMLElement,
		private readonly onMove: (top: number) => void,
		private readonly onSnap: (detent: Detent) => void,
	) {
		this.stage = root.createDiv("th-stage");
		this.hero = this.stage.createDiv("th-hero");
		this.sheet = root.createDiv("th-sheet");
		this.grip = this.sheet.createDiv("th-sheet-grip");
		this.grip.createDiv("th-sheet-grabber");
		this.head = this.grip.createDiv("th-sheet-head");
		this.scroll = this.sheet.createDiv("th-today-scroll");
		this.grip.addEventListener("pointerdown", (event) => this.start(event));
		this.grip.addEventListener("pointermove", (event) => this.follow(event));
		this.grip.addEventListener("pointerup", (event) => this.release(event));
		this.grip.addEventListener("pointercancel", (event) => this.release(event));
		this.grabber().addEventListener("click", () => this.snap(this.detent === "half" ? "full" : "half"));
		this.resizer = new ResizeObserver(() => this.place(this.detentTop(this.detent)));
		this.resizer.observe(root);
		// Placed at once, not on the observer's first call, so the jar never sees a screen without its floor.
		if (root.clientHeight > 0) this.place(this.detentTop(this.detent));
	}

	destroy(): void {
		this.resizer.disconnect();
		cancelAnimationFrame(this.settleFrame);
	}

	snap(detent: Detent): void {
		const changed = detent !== this.detent;
		this.detent = detent;
		this.settle(this.detentTop(detent));
		if (changed) this.onSnap(detent);
	}

	private grabber(): HTMLElement {
		return this.grip.firstElementChild as HTMLElement;
	}

	private detentTop(detent: Detent): number {
		const height = this.root.clientHeight;
		const heroTop = this.hero.offsetTop;
		const full = heroTop + FULL_STAGE;
		const half = Math.max(full + 120, Math.round(height * HALF));
		return detent === "full" ? full : half;
	}

	private start(event: PointerEvent): void {
		if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
		cancelAnimationFrame(this.settleFrame);
		this.sheet.removeClass("is-settling");
		if (this.grip.hasPointerCapture(event.pointerId) === false && event.isTrusted) this.grip.setPointerCapture(event.pointerId);
		this.drag = { pointer: event.pointerId, startY: event.clientY, startTop: this.top, lastY: event.clientY, lastAt: event.timeStamp, speed: 0 };
	}

	private follow(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
		drag.speed = (event.clientY - drag.lastY) / elapsed;
		drag.lastY = event.clientY;
		drag.lastAt = event.timeStamp;
		const full = this.detentTop("full");
		const half = this.detentTop("half");
		let top = drag.startTop + event.clientY - drag.startY;
		if (top < full) top = full - (full - top) * RUBBER;
		if (top > half) top = half + (top - half) * RUBBER;
		this.place(top);
	}

	private release(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		this.drag = null;
		if (Math.abs(event.clientY - drag.startY) < 4) return;
		const full = this.detentTop("full");
		const half = this.detentTop("half");
		let detent: Detent;
		if (drag.speed < -FLICK) detent = "full";
		else if (drag.speed > FLICK) detent = "half";
		else detent = this.top - full < half - this.top ? "full" : "half";
		this.snap(detent);
	}

	/** Moves the sheet with iOS's settling curve, reporting its position every frame so the marbles move with it. */
	private settle(top: number): void {
		cancelAnimationFrame(this.settleFrame);
		if (Math.abs(top - this.top) < 1) {
			this.place(top);
			return;
		}
		this.sheet.addClass("is-settling");
		this.sheet.style.setProperty("--th-settle", `${SETTLE_MS}ms ${SETTLE}`);
		this.place(top, false);
		const until = performance.now() + SETTLE_MS + 40;
		const report = () => {
			const now = this.sheet.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
			this.onMove(now);
			this.root.style.setProperty("--th-sheet-p", String(this.progress(now)));
			if (performance.now() < until) this.settleFrame = requestAnimationFrame(report);
			else this.sheet.removeClass("is-settling");
		};
		this.settleFrame = requestAnimationFrame(report);
	}

	private place(top: number, report = true): void {
		this.top = top;
		this.root.style.setProperty("--th-sheet-top", `${top}px`);
		if (!report) return;
		this.root.style.setProperty("--th-sheet-p", String(this.progress(top)));
		this.onMove(top);
	}

	/** 0 with the sheet halfway, 1 pulled up: how far the number has shrunk. */
	private progress(top: number): number {
		const full = this.detentTop("full");
		const half = this.detentTop("half");
		return Math.min(1, Math.max(0, (half - top) / Math.max(1, half - full)));
	}
}
