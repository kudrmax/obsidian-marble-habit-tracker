import { SETTLE } from "./Motion";

/** Where the sheet heads on a tap of its grabber: up, covering the days, or down to show them. */
export type Detent = "up" | "down";

/** How far the sheet drops to show the days above it on a tap of the grabber. */
const DOWN_BY = 250;
/** How much of the sheet stays in sight at the lowest it can rest. */
const MIN_SHEET = 220;
/** A flick faster than this, in px per ms, carries the sheet all the way up, or down to the days. */
const FLICK = 0.45;
/** Past its range the sheet follows the finger at this fraction, like iOS rubber-banding. */
const RUBBER = 0.35;
const SETTLE_MS = 420;

/**
 * Today's two layers: the days on the stage, and a sheet over them that holds the habits. The sheet rests up, so the
 * habits come first; dragged by its grip it stays wherever it is let go, between up and low enough to keep some
 * habits in sight, and the day columns reach under its edge and stretch with it. Everything that depends on the
 * sheet's position hears about it through `onMove`.
 */
export class TodaySheet {
	readonly stage: HTMLElement;
	/** The strip of days, one column each, under the sheet. */
	readonly days: HTMLElement;
	readonly sheet: HTMLElement;
	readonly grip: HTMLElement;
	/** The sheet's own header under the grabber, used by All habits; dragging it moves the sheet too. */
	readonly head: HTMLElement;
	readonly scroll: HTMLElement;
	private detent: Detent = "up";
	private top = 0;
	/** Where the sheet was let go, as a distance below its top position, kept across resizes. */
	private rest = 0;
	private drag: { pointer: number; startY: number; startTop: number; lastY: number; lastAt: number; speed: number } | null = null;
	private settleFrame = 0;
	private readonly resizer: ResizeObserver;

	constructor(
		private readonly root: HTMLElement,
		private readonly onMove: (top: number) => void,
		private readonly onSnap: (detent: Detent) => void,
	) {
		this.stage = root.createDiv("th-stage");
		this.days = this.stage.createDiv("th-days");
		this.sheet = root.createDiv("th-sheet");
		this.grip = this.sheet.createDiv("th-sheet-grip");
		this.grip.createDiv("th-sheet-grabber");
		this.head = this.grip.createDiv("th-sheet-head");
		this.scroll = this.sheet.createDiv("th-today-scroll");
		this.grip.addEventListener("pointerdown", (event) => this.start(event));
		this.grip.addEventListener("pointermove", (event) => this.follow(event));
		this.grip.addEventListener("pointerup", (event) => this.release(event));
		this.grip.addEventListener("pointercancel", (event) => this.release(event));
		this.grabber().addEventListener("click", () => this.snap(this.detent === "up" ? "down" : "up"));
		this.resizer = new ResizeObserver(() => this.place(this.restTop()));
		this.resizer.observe(root);
		if (root.clientHeight > 0) this.place(this.restTop());
	}

	destroy(): void {
		this.resizer.disconnect();
		cancelAnimationFrame(this.settleFrame);
	}

	snap(detent: Detent): void {
		this.rest = detent === "down" ? DOWN_BY : 0;
		this.settleAt(this.restTop());
	}

	/** Lets the sheet rest at `top`, kept within its range, and says when it has gone up or come down from up. */
	private settleAt(top: number): void {
		const clamped = Math.min(this.lowest(), Math.max(this.highest(), top));
		this.rest = clamped - this.highest();
		const detent: Detent = this.rest < 1 ? "up" : "down";
		if (detent !== this.detent) this.onSnap(detent);
		this.detent = detent;
		this.settle(clamped);
	}

	private restTop(): number {
		return Math.min(this.lowest(), this.highest() + this.rest);
	}

	private grabber(): HTMLElement {
		return this.grip.firstElementChild as HTMLElement;
	}

	private highest(): number {
		return this.days.offsetTop;
	}

	private lowest(): number {
		return Math.max(this.highest(), this.root.clientHeight - MIN_SHEET);
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
		const up = this.highest();
		const low = this.lowest();
		let top = drag.startTop + event.clientY - drag.startY;
		if (top < up) top = up - (up - top) * RUBBER;
		if (top > low) top = low + (top - low) * RUBBER;
		this.place(top);
	}

	private release(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		this.drag = null;
		if (Math.abs(event.clientY - drag.startY) < 4) return;
		const down = this.highest() + DOWN_BY;
		if (drag.speed < -FLICK) this.settleAt(this.highest());
		else if (drag.speed > FLICK && this.top < down) this.settleAt(down);
		else this.settleAt(this.top);
	}

	/** Moves the sheet with iOS's settling curve, reporting its position every frame so the days stretch with it. */
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
			this.root.style.setProperty("--th-sheet-now", `${now}px`);
			this.onMove(now);
			if (performance.now() < until) this.settleFrame = requestAnimationFrame(report);
			else this.sheet.removeClass("is-settling");
		};
		this.settleFrame = requestAnimationFrame(report);
	}

	private place(top: number, report = true): void {
		this.top = top;
		this.root.style.setProperty("--th-sheet-top", `${top}px`);
		if (!report) return;
		this.root.style.setProperty("--th-sheet-now", `${top}px`);
		this.onMove(top);
	}
}
