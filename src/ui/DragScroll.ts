/** How far the mouse moves before a press on the strip counts as a drag, not a click. */
const DRAG_PX = 4;

/**
 * Sideways scrolling for a strip with a mouse, the way a finger already does it on a phone: the wheel scrolls it
 * across, and dragging with the button down pulls it along. A drag swallows the click it ends with.
 */
export class DragScroll {
	private press: { pointer: number; x: number; left: number; moved: boolean } | null = null;
	private swallowClick = false;

	constructor(private readonly strip: HTMLElement) {
		strip.addEventListener("wheel", this.wheel, { passive: false });
		strip.addEventListener("pointerdown", this.down);
		strip.addEventListener("pointermove", this.move);
		strip.addEventListener("pointerup", this.up);
		strip.addEventListener("pointercancel", this.up);
		strip.addEventListener("click", this.click, true);
	}

	destroy(): void {
		this.strip.removeEventListener("wheel", this.wheel);
		this.strip.removeEventListener("pointerdown", this.down);
		this.strip.removeEventListener("pointermove", this.move);
		this.strip.removeEventListener("pointerup", this.up);
		this.strip.removeEventListener("pointercancel", this.up);
		this.strip.removeEventListener("click", this.click, true);
	}

	private readonly wheel = (event: WheelEvent) => {
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		this.strip.scrollLeft += event.deltaY;
		event.preventDefault();
	};

	private readonly down = (event: PointerEvent) => {
		if (event.pointerType !== "mouse" || event.button !== 0) return;
		this.press = { pointer: event.pointerId, x: event.clientX, left: this.strip.scrollLeft, moved: false };
	};

	private readonly move = (event: PointerEvent) => {
		const press = this.press;
		if (!press || event.pointerId !== press.pointer) return;
		const dx = event.clientX - press.x;
		if (!press.moved && Math.abs(dx) < DRAG_PX) return;
		if (!press.moved) {
			press.moved = true;
			this.strip.setPointerCapture(event.pointerId);
		}
		this.strip.scrollLeft = press.left - dx;
	};

	private readonly up = (event: PointerEvent) => {
		const press = this.press;
		if (!press || event.pointerId !== press.pointer) return;
		this.swallowClick = press.moved;
		this.press = null;
	};

	private readonly click = (event: MouseEvent) => {
		if (!this.swallowClick) return;
		this.swallowClick = false;
		event.stopPropagation();
		event.preventDefault();
	};
}
