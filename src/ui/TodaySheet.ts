import { SETTLE } from "./Motion";

/** Where the sheet heads on a tap of its grabber: up, covering the days, or down to show them. */
export type Detent = "up" | "down";

/** How far the sheet drops to show the days above it on a tap of the grabber. */
const DOWN_BY = 250;
/** How much of the sheet stays in sight at the lowest it can rest. */
const MIN_SHEET = 220;
/** The furthest the sheet goes below its top position, so the days never stretch into a wall. */
const MAX_DOWN = 340;
/** A finger has to move this far on the list before it is clear whether it scrolls the list or moves the sheet. */
const TOUCH_SLOP = 6;
/** Movement under this on a pull is a tap's tremble, not a pull. */
const TAP_TREMBLE = 4;
/** A flick faster than this, in px per ms, carries the sheet all the way up, or down to the days. */
const FLICK = 0.45;
/** Past its top the sheet follows the finger at this fraction, like iOS rubber-banding; past its bottom, less. */
const RUBBER = 0.35;
const RUBBER_LOW = 0.15;
const SETTLE_MS = 420;

/**
 * Today's two layers: the days on the stage, and a sheet over them that holds the habits. The sheet rests up, so the
 * habits come first; dragged it stays wherever it is let go, within its range, and the day columns reach under its
 * edge and stretch with it. It moves by its grip, and by the list where the list has nothing to scroll: pulled down
 * when the list is at its top. Everything that depends on its position hears about it through `onMove`.
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
	/** A finger on the list; `sheet` once it is moving the sheet rather than scrolling. */
	private touch: { id: number; originY: number; startY: number; startTop: number; lastY: number; lastAt: number; speed: number; mode: "sheet" | "scroll" | null } | null = null;
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
		// Obsidian opens its command palette on a pull down the page; a pull that moves the sheet must not reach it.
		for (const type of ["touchstart", "touchmove", "touchend"] as const) this.grip.addEventListener(type, (event) => event.stopPropagation());
		this.scroll.addEventListener("touchstart", this.touchStart, { passive: true });
		this.scroll.addEventListener("touchmove", this.touchMove, { passive: false });
		this.scroll.addEventListener("touchend", this.touchEnd);
		this.scroll.addEventListener("touchcancel", this.touchEnd);
		this.scroll.addEventListener("scroll", () => this.sheet.toggleClass("is-scrolled", this.scroll.scrollTop > 0), { passive: true });
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
		const up = this.highest();
		return Math.max(up, Math.min(up + MAX_DOWN, this.root.clientHeight - MIN_SHEET));
	}

	/** Where the finger's position puts the sheet, giving way less and less past either end of its range. */
	private bounded(top: number): number {
		const up = this.highest();
		const low = this.lowest();
		if (top < up) return up - (up - top) * RUBBER;
		if (top > low) return low + (top - low) * RUBBER_LOW;
		return top;
	}

	/** Where the sheet goes when let go: a flick carries it all the way up, or down to the days; otherwise it stays. */
	private letGo(speed: number): void {
		const down = this.highest() + DOWN_BY;
		if (speed < -FLICK) this.settleAt(this.highest());
		else if (speed > FLICK && this.top < down) this.settleAt(down);
		else this.settleAt(this.top);
	}

	/**
	 * Whether a move on the list goes to the sheet instead, only where the list has nothing to scroll that way: down
	 * when it is already at its top, up while the sheet is down and the list fits without scrolling. A row being
	 * dragged keeps the finger.
	 */
	private listMovesSheet(dy: number): boolean {
		if (this.sheet.querySelector(".is-dragging")) return false;
		if (dy > 0) return this.scroll.scrollTop <= 0;
		const fits = this.scroll.scrollHeight <= this.scroll.clientHeight + 1;
		return fits && this.top > this.highest() + 1;
	}

	private readonly touchStart = (event: TouchEvent) => {
		const finger = event.touches.length === 1 ? event.touches[0] : null;
		this.touch = finger ? { id: finger.identifier, originY: finger.clientY, startY: finger.clientY, startTop: this.top, lastY: finger.clientY, lastAt: event.timeStamp, speed: 0, mode: null } : null;
	};

	private readonly touchMove = (event: TouchEvent) => {
		const touch = this.touch;
		const finger = touch && [...event.touches].find((each) => each.identifier === touch.id);
		if (!touch || !finger) return;
		if (touch.mode === null) {
			const dy = finger.clientY - touch.startY;
			if (dy === 0) return;
			// A pull down on a list already at its top is the sheet's from the first pixel: iOS starts its own bounce at
			// once, and after that the move can no longer be taken over. Any other direction waits to be sure.
			const pullAtTop = dy > 0 && this.scroll.scrollTop <= 0;
			if (!pullAtTop && Math.abs(dy) < TOUCH_SLOP) return;
			touch.mode = this.listMovesSheet(dy) ? "sheet" : "scroll";
			if (touch.mode === "sheet") {
				cancelAnimationFrame(this.settleFrame);
				this.sheet.removeClass("is-settling");
				touch.startY = finger.clientY;
				touch.startTop = this.top;
			}
		}
		if (touch.mode !== "sheet") return;
		event.preventDefault();
		event.stopPropagation();
		// A finger that only trembles on a tap leaves the sheet where it is.
		if (Math.abs(finger.clientY - touch.originY) < TAP_TREMBLE) return;
		touch.speed = (finger.clientY - touch.lastY) / Math.max(1, event.timeStamp - touch.lastAt);
		touch.lastY = finger.clientY;
		touch.lastAt = event.timeStamp;
		this.place(this.bounded(touch.startTop + finger.clientY - touch.startY));
	};

	private readonly touchEnd = (event: TouchEvent) => {
		const touch = this.touch;
		this.touch = null;
		if (touch?.mode !== "sheet") return;
		event.stopPropagation();
		if (Math.abs(touch.lastY - touch.originY) < TAP_TREMBLE) return;
		this.letGo(touch.speed);
	};

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
		this.place(this.bounded(drag.startTop + event.clientY - drag.startY));
	}

	private release(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		this.drag = null;
		if (Math.abs(event.clientY - drag.startY) < 4) return;
		this.letGo(drag.speed);
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
