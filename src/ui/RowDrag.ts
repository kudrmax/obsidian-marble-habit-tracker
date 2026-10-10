const LIFT_MS = 400;
/** How far a finger may wander before the hold counts as a scroll instead of a lift. */
const SLOP = 8;
const ROW = ".th-row[data-drag]";
const HANDLE = ".th-row-text";

interface Dragging {
	readonly row: HTMLElement;
	readonly others: HTMLElement[];
	readonly from: number;
	readonly startY: number;
	readonly middle: number;
	readonly step: number;
	readonly middles: number[];
	to: number;
}

/**
 * Hold a row's text, then drag it up or down to a new place. While a row is lifted the page doesn't scroll and a tap
 * that ends the drag doesn't open the habit. `onDrop` gets the row's `data-drag` key and its new index among the rows,
 * or null when it went back to where it was.
 */
export class RowDrag {
	private timer = 0;
	private pressed: { row: HTMLElement; x: number; y: number } | null = null;
	private dragging: Dragging | null = null;
	private swallowClick = false;

	constructor(
		private readonly column: HTMLElement,
		private readonly onLift: () => void,
		private readonly onDrop: (key: string, to: number | null) => void,
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
		const row = target?.closest(HANDLE)?.closest<HTMLElement>(ROW);
		if (!row) return;
		this.pressed = { row, x: event.clientX, y: event.clientY };
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.lift(), LIFT_MS);
	};

	private lift(): void {
		const pressed = this.pressed;
		this.pressed = null;
		if (!pressed || !pressed.row.isConnected) return;
		const rows = [...this.column.querySelectorAll<HTMLElement>(ROW)];
		const from = rows.indexOf(pressed.row);
		if (from < 0) return;
		const box = pressed.row.getBoundingClientRect();
		const others = rows.filter((row) => row !== pressed.row);
		this.dragging = {
			row: pressed.row,
			others,
			from,
			to: from,
			startY: pressed.y,
			middle: box.top + box.height / 2,
			step: box.height + parseFloat(getComputedStyle(pressed.row).marginBottom || "0"),
			middles: others.map((row) => {
				const rect = row.getBoundingClientRect();
				return rect.top + rect.height / 2;
			}),
		};
		this.swallowClick = true;
		pressed.row.addClass("is-dragging");
		for (const row of others) row.addClass("is-shifting");
		this.onLift();
	}

	private move(y: number): void {
		const dragging = this.dragging;
		if (!dragging) return;
		const offset = y - dragging.startY;
		dragging.row.style.transform = `translateY(${offset}px)`;
		const center = dragging.middle + offset;
		dragging.to = dragging.middles.filter((middle) => middle < center).length;
		dragging.others.forEach((row, index) => {
			const shift = index >= dragging.from && index < dragging.to ? -dragging.step : index < dragging.from && index >= dragging.to ? dragging.step : 0;
			row.style.transform = shift ? `translateY(${shift}px)` : "";
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
		const key = dragging.row.dataset.drag ?? "";
		if (dragging.to === dragging.from) return this.onDrop(key, null);
		const anchor = dragging.others[dragging.to];
		if (anchor) anchor.before(dragging.row);
		else dragging.others[dragging.others.length - 1]?.after(dragging.row);
		this.onDrop(key, dragging.to);
	};

	private readonly abort = () => {
		const dragging = this.dragging;
		this.release();
		if (!dragging) return;
		this.settle(dragging);
		this.onDrop(dragging.row.dataset.drag ?? "", null);
	};

	private settle(dragging: Dragging): void {
		this.dragging = null;
		dragging.row.removeClass("is-dragging");
		dragging.row.style.transform = "";
		for (const row of dragging.others) {
			row.removeClass("is-shifting");
			row.style.transform = "";
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
