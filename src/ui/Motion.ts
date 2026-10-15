/** iOS's own curve for things settling into place, and a spring that overshoots a little. */
export const SETTLE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
/** Even through the middle, so a moving shape is seen on its way and not only where it lands. */
const FLIGHT = "cubic-bezier(0.55, 0, 0.25, 1)";

/** A just-answered row stays on screen this long, so the filled circle is seen, then folds away. */
const LEAVE_HOLD_MS = 420;
const LEAVE_FOLD_MS = 280;
export const LEAVE_MS = LEAVE_HOLD_MS + LEAVE_FOLD_MS;

const DAY_MS = 260;
const PUSH_MS = 380;
const GROW_MS = 300;
const BUMP_MS = 420;
const UNFOLD_OUT_MS = 200;
const UNFOLD_IN_MS = 440;
const MORPH_MS = 650;
const LABEL_MS = 180;
const ENTER_MS = 520;
const STAGGER_MS = 70;
const PICK_MS = 220;

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

	/**
	 * A row turns into its choices, so that one is seen becoming the other: the circle at `origin` flies right, stretching
	 * into the last choice — it keeps its ring — while the other choices come in from the left edge and the name fades.
	 */
	unfold(surface: HTMLElement, content: readonly HTMLElement[], choices: readonly HTMLElement[], origin: DOMRect | null): void {
		if (this.reduced() || choices.length === 0) return;
		for (const element of content) {
			// The circle leaves at once: from here on the flying ring is the circle.
			const isCircle = element.querySelector(".th-mark") !== null;
			element.animate(
				[
					{ transform: "none", opacity: isCircle ? 0 : 1 },
					{ transform: isCircle ? "none" : "translateX(40px)", opacity: 0 },
				],
				{ duration: isCircle ? 1 : UNFOLD_OUT_MS, easing: SETTLE, fill: "forwards" },
			);
		}
		const target = choices[choices.length - 1];
		const entering = choices.slice(0, -1);
		const area = surface.getBoundingClientRect();
		if (origin) {
			const end = target.getBoundingClientRect();
			const ghost = surface.createDiv("th-morph");
			const frame = (box: { left: number; top: number; width: number; height: number }) => ({
				left: `${box.left - area.left}px`,
				top: `${box.top - area.top}px`,
				width: `${box.width}px`,
				height: `${box.height}px`,
			});
			// The ring and the button are the same shape at the end, so one takes the other's place in a single frame: no fade, no flicker.
			target.style.visibility = "hidden";
			const label = target.querySelector<HTMLElement>(".th-choice-pill-text");
			const land = () => {
				ghost.remove();
				target.style.visibility = "";
				label?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LABEL_MS, easing: "ease-out" });
			};
			ghost.animate([frame(origin), frame(end)], { duration: MORPH_MS, easing: FLIGHT, fill: "forwards" }).finished.then(land, land);
		}
		entering.forEach((choice, index) => {
			const from = area.left - choice.getBoundingClientRect().right - 8;
			choice.animate(
				[
					{ transform: `translateX(${from}px)`, opacity: 0.4 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: ENTER_MS, delay: 90 + (entering.length - 1 - index) * STAGGER_MS, easing: SPRING, fill: "backwards" },
			);
		});
	}

	/** Closing the choices without an answer: the row's content slides back in from the right. */
	refold(content: readonly HTMLElement[]): void {
		if (this.reduced()) return;
		for (const element of content) {
			element.animate(
				[
					{ transform: "translateX(56px)", opacity: 0 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: UNFOLD_IN_MS * 0.8, easing: SETTLE },
			);
		}
	}

	/** The picked choice swells and lights up while the others shrink into it; resolves when the row can take the answer. */
	pick(picked: HTMLElement, others: readonly HTMLElement[]): Promise<void> {
		if (this.reduced()) return Promise.resolve();
		picked.addClass("is-picked");
		for (const other of others) {
			other.animate(
				[
					{ transform: "none", opacity: 1 },
					{ transform: "scale(0.6)", opacity: 0 },
				],
				{ duration: PICK_MS, easing: SETTLE, fill: "forwards" },
			);
		}
		return picked
			.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.45 }, { transform: "scale(1)" }], { duration: PICK_MS + 60, easing: SPRING })
			.finished.then(() => undefined);
	}

	/** A number that just grew swells for a moment, like a counter ticking up. */
	bump(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: BUMP_MS, easing: SPRING });
	}
}
