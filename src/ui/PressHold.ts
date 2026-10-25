/** How long a press lasts before it counts as a hold: a marked circle clears and a row lifts after the same hold. */
export const HOLD_MS = 400;
/** How far a finger may wander before the hold counts as a scroll instead. */
export const HOLD_SLOP = 8;

/** Where the hold hears a press end and keeps its clock: the window, or a stand-in for it. */
export type PressHoldHost = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;

/**
 * A hold on an element runs its action once the main button or a finger has been down HOLD_MS without wandering off;
 * a shorter press does nothing. The action redraws the view under the finger, so the click and the context menu that
 * end the hold would land on what is drawn there now: the view's root swallows both until the next press. Obsidian's
 * phone app opens a context menu of its own on a long touch and sends it to the element first touched, even once the
 * redraw has taken it off the page, so the element swallows that one itself.
 */
export class PressHold {
	private timer = 0;
	private start: { x: number; y: number } | null = null;
	private held = false;

	constructor(
		private readonly root: HTMLElement,
		private readonly host: PressHoldHost = window,
	) {
		root.addEventListener("pointerdown", this.press, true);
		root.addEventListener("click", this.swallow, true);
		root.addEventListener("contextmenu", this.swallow, true);
		host.addEventListener("pointermove", this.move);
		host.addEventListener("pointerup", this.cancel);
		host.addEventListener("pointercancel", this.cancel);
	}

	attach(element: HTMLElement, action: () => void): void {
		element.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			this.start = { x: event.clientX, y: event.clientY };
			this.timer = this.host.setTimeout(() => {
				this.start = null;
				this.held = true;
				action();
			}, HOLD_MS);
		});
		element.addEventListener("contextmenu", this.swallow, true);
	}

	destroy(): void {
		this.cancel();
		this.root.removeEventListener("pointerdown", this.press, true);
		this.root.removeEventListener("click", this.swallow, true);
		this.root.removeEventListener("contextmenu", this.swallow, true);
		this.host.removeEventListener("pointermove", this.move);
		this.host.removeEventListener("pointerup", this.cancel);
		this.host.removeEventListener("pointercancel", this.cancel);
	}

	private readonly press = () => {
		this.cancel();
		this.held = false;
	};

	private readonly move = (event: PointerEvent) => {
		if (this.start && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > HOLD_SLOP) this.cancel();
	};

	private readonly cancel = () => {
		this.host.clearTimeout(this.timer);
		this.start = null;
	};

	/** A touch's own context menu, opened by the same long press, is swallowed while the hold still counts too. */
	private readonly swallow = (event: Event) => {
		if (!this.held && !(this.start && event.type === "contextmenu")) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
}
