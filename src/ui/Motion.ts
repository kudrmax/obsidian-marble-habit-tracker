/** iOS's own curve for things settling into place, and a spring that overshoots a little. */
export const SETTLE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

/** A just-answered row stays on screen this long, so the filled circle is seen, then folds away. */
const LEAVE_HOLD_MS = 420;
const LEAVE_FOLD_MS = 280;
export const LEAVE_MS = LEAVE_HOLD_MS + LEAVE_FOLD_MS;

const DAY_MS = 260;
const PUSH_MS = 380;
const GROW_MS = 300;
const PROGRESS_MS = 450;

/** Stepping a day back or forward, opening All habits, or going back from it. */
export type Slide = "earlier" | "later" | "push" | "pop";

/**
 * The motion of Today. Today redraws from scratch on every change, so each effect is started on the fresh elements,
 * and an effect still running on the old ones carries on from where it was.
 */
export class Motion {
	constructor(private readonly reduced: () => boolean) {}

	/** A row answered `since` ms ago: still for a moment, then its height folds to nothing. */
	leave(row: HTMLElement, since: number): void {
		if (this.reduced()) return;
		row.addClass("is-leaving");
		const animation = row.animate(
			[
				{ height: `${row.offsetHeight}px`, opacity: 1 },
				{ height: "0px", opacity: 0 },
			],
			{ delay: LEAVE_HOLD_MS, duration: LEAVE_FOLD_MS, easing: SETTLE, fill: "forwards" },
		);
		animation.currentTime = Math.min(Math.max(0, Date.now() - since), LEAVE_MS);
	}

	/** The screen's content slides in from the side it came from. */
	slide(elements: readonly HTMLElement[], kind: Slide): void {
		if (this.reduced()) return;
		const push = kind === "push" || kind === "pop";
		const sign = kind === "later" || kind === "push" ? 1 : -1;
		const distance = push ? "36%" : "28px";
		for (const element of elements) {
			element.animate(
				[
					{ transform: `translateX(calc(${sign} * ${distance}))`, opacity: 0 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: push ? PUSH_MS : DAY_MS, easing: SETTLE },
			);
		}
	}

	/** Something that just opened grows from nothing to its height. */
	grow(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate(
			[
				{ height: "0px", opacity: 0 },
				{ height: `${element.offsetHeight}px`, opacity: 1 },
			],
			{ duration: GROW_MS, easing: SETTLE },
		);
	}

	/** Something about to close folds away first; resolves when it is gone. */
	fold(element: HTMLElement): Promise<void> {
		if (this.reduced()) return Promise.resolve();
		const animation = element.animate(
			[
				{ height: `${element.offsetHeight}px`, opacity: 1 },
				{ height: "0px", opacity: 0 },
			],
			{ duration: GROW_MS * 0.8, easing: SETTLE, fill: "forwards" },
		);
		return animation.finished.then(() => undefined);
	}

	/** The progress bar moves from its last width to the new one. */
	progress(fill: HTMLElement, from: number | null, to: number): void {
		const target = `${to * 100}%`;
		if (from === null || from === to || this.reduced()) {
			fill.setCssProps({ width: target });
			return;
		}
		fill.setCssProps({ width: target });
		fill.animate([{ width: `${from * 100}%` }, { width: target }], { duration: PROGRESS_MS, easing: SETTLE });
	}

	/** A small menu opens from the control it belongs to. */
	pop(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate(
			[
				{ transform: "scale(0.6)", opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 260, easing: SPRING },
		);
	}
}
