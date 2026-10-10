const LIFT_MS = 400;
/** How far a finger may wander before the hold counts as a scroll instead of a lift. */
const SLOP = 8;
const SLOT = "[data-slot]";
const ROW_HANDLE = ".th-row-text";

export type DragKind = "row" | "header";

/** What was dropped: a habit row or a section header (which carries its rows); the screen already shows the new order. */
export interface Drop {
	readonly kind: DragKind;
	readonly element: HTMLElement;
}

interface Dragging {
	readonly kind: DragKind;
	readonly block: HTMLElement[];
	readonly others: HTMLElement[];
	readonly from: number;
	readonly startY: number;
	readonly middle: number;
	readonly step: number;
	readonly middles: number[];
	to: number;
}

/**
 * Reordering on Today. The column holds slots in screen order: habit rows (`data-slot="row"`), section headers
 * (`"header"`) and the new-section zone (`"zone"`). Hold a row's text or a header, then drag; a header carries the
 * rows under it and lands only between sections. While dragging the page doesn't scroll, and the tap that ends a drag
 * doesn't open anything. `onDrop` gets null when the slot went back where it was.
 */
export class RowDrag {
	private timer = 0;
	private pressed: { element: HTMLElement; kind: DragKind; x: number; y: number } | null = null;
	private dragging: Dragging | null = null;
	private swallowClick = false;

	constructor(
		private readonly column: HTMLElement,
		private readonly onLift: () => void,
		private readonly onDrop: (drop: Drop | null) => void,
	) {
		column.addEventListener("pointerdown", this.down);
		column.addEventListener("click", this.click, true);
		column.addEventListener("touchmove", this.touchMove, { passive: false });
		window.addEventListener("pointermove", this.pointerMove);
		window.addEventListener("pointerup", this.end);
		window.addEventListener("pointercancel", this.pointerCancel);
		window.addEventListener("touchend", this.end);
		window.addEventListener("touchcancel", this.abort);
	}

	get active(): boolean {
		return this.dragging !== null;
	}

	destroy(): void {
		this.abort();
		this.column.removeEventListener("pointerdown", this.down);
		this.column.removeEventListener("click", this.click, true);
		this.column.removeEventListener("touchmove", this.touchMove);
		window.removeEventListener("pointermove", this.pointerMove);
		window.removeEventListener("pointerup", this.end);
		window.removeEventListener("pointercancel", this.pointerCancel);
		window.removeEventListener("touchend", this.end);
		window.removeEventListener("touchcancel", this.abort);
	}

	private readonly down = (event: PointerEvent) => {
		this.swallowClick = false;
		if (event.button !== 0 || this.dragging) return;
		const target = event.target instanceof Element ? event.target : null;
		const row = target?.closest(ROW_HANDLE)?.closest<HTMLElement>('[data-slot="row"]');
		const header = target?.closest<HTMLElement>('[data-slot="header"]');
		const element = row ?? header;
		if (!element) return;
		this.pressed = { element, kind: row ? "row" : "header", x: event.clientX, y: event.clientY };
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.lift(), LIFT_MS);
	};

	private lift(): void {
		const pressed = this.pressed;
		this.pressed = null;
		if (!pressed || !pressed.element.isConnected) return;
		const slots = [...this.column.querySelectorAll<HTMLElement>(SLOT)];
		const from = slots.indexOf(pressed.element);
		if (from < 0) return;
		const block = [pressed.element];
		if (pressed.kind === "header") for (let index = from + 1; slots[index]?.dataset.slot === "row"; index++) block.push(slots[index]);
		const others = slots.filter((slot) => !block.includes(slot));
		const top = block[0].getBoundingClientRect().top;
		const last = block[block.length - 1];
		const bottom = last.getBoundingClientRect().bottom;
		this.dragging = {
			kind: pressed.kind,
			block,
			others,
			from,
			to: from,
			startY: pressed.y,
			middle: (top + bottom) / 2,
			step: bottom - top + parseFloat(getComputedStyle(last).marginBottom || "0"),
			middles: others.map((slot) => {
				const rect = slot.getBoundingClientRect();
				return rect.top + rect.height / 2;
			}),
		};
		this.swallowClick = true;
		for (const element of block) element.addClass("is-dragging");
		for (const slot of others) slot.addClass("is-shifting");
		this.onLift();
	}

	/** A header lands only right before another header or the new-section zone, so it never splits a section. */
	private allowed(dragging: Dragging, to: number): boolean {
		if (dragging.kind === "row") return true;
		const next = dragging.others[to]?.dataset.slot;
		return next === "header" || next === "zone";
	}

	private nearestAllowed(dragging: Dragging, wanted: number): number {
		for (let distance = 0; distance <= dragging.others.length; distance++) {
			for (const to of [wanted - distance, wanted + distance]) if (to >= 0 && to <= dragging.others.length && this.allowed(dragging, to)) return to;
		}
		return dragging.from;
	}

	private move(y: number): void {
		const dragging = this.dragging;
		if (!dragging) return;
		const offset = y - dragging.startY;
		for (const element of dragging.block) element.style.transform = `translateY(${offset}px)`;
		const center = dragging.middle + offset;
		dragging.to = this.nearestAllowed(dragging, dragging.middles.filter((middle) => middle < center).length);
		dragging.others.forEach((slot, index) => {
			const shift = index >= dragging.from && index < dragging.to ? -dragging.step : index < dragging.from && index >= dragging.to ? dragging.step : 0;
			slot.style.transform = shift ? `translateY(${shift}px)` : "";
		});
	}

	private readonly pointerMove = (event: PointerEvent) => {
		if (this.dragging) return this.move(event.clientY);
		if (this.pressed && Math.hypot(event.clientX - this.pressed.x, event.clientY - this.pressed.y) > SLOP) this.release();
	};

	private readonly touchMove = (event: TouchEvent) => {
		if (!this.dragging) return;
		event.preventDefault();
		const touch = event.touches[0];
		if (touch) this.move(touch.clientY);
	};

	/** The browser may hand a held touch over to scrolling; a lifted row keeps following the touch events instead. */
	private readonly pointerCancel = () => {
		if (!this.dragging) this.release();
	};

	private readonly end = () => {
		const dragging = this.dragging;
		if (!dragging) return this.release();
		this.settle(dragging);
		if (dragging.to === dragging.from) return this.onDrop(null);
		const anchor = dragging.others[dragging.to];
		if (anchor) anchor.before(...dragging.block);
		else dragging.others[dragging.others.length - 1]?.after(...dragging.block);
		this.onDrop({ kind: dragging.kind, element: dragging.block[0] });
	};

	private readonly abort = () => {
		const dragging = this.dragging;
		this.release();
		if (!dragging) return;
		this.settle(dragging);
		this.onDrop(null);
	};

	private settle(dragging: Dragging): void {
		this.dragging = null;
		for (const element of dragging.block) {
			element.removeClass("is-dragging");
			element.style.transform = "";
		}
		for (const slot of dragging.others) {
			slot.removeClass("is-shifting");
			slot.style.transform = "";
		}
	}

	private release(): void {
		window.clearTimeout(this.timer);
		this.pressed = null;
	}

	private readonly click = (event: MouseEvent) => {
		if (!this.swallowClick) return;
		this.swallowClick = false;
		event.stopPropagation();
		event.preventDefault();
	};
}
