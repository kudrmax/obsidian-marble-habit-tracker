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
const BUMP_MS = 420;
/** From the tap to the last frame of the choices, as tried and timed on the demos. */
const CHOICES_MS = 480;
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
	 * A row turns into its choices as the Dynamic Island splits: the circle at `origin` stays put and turns into the
	 * cancel button, a capsule in the habit's color spills out of it to the right across the row, and then pinches into
	 * the choices, each taking on its own look; the name fades. Half the time to spill, half to split.
	 */
	unfold(surface: HTMLElement, content: readonly HTMLElement[], cancel: HTMLElement, choices: readonly HTMLElement[], origin: DOMRect | null): void {
		if (this.reduced() || choices.length === 0) return;
		for (const element of content) {
			const isCircle = element.querySelector(".th-mark") !== null;
			element.animate(
				[
					{ transform: "none", opacity: isCircle ? 0 : 1 },
					{ transform: isCircle ? "none" : "translateX(24px)", opacity: 0 },
				],
				{ duration: isCircle ? 1 : CHOICES_MS / 2, easing: SETTLE, fill: "forwards" },
			);
		}
		cancel.animate(
			[
				{ transform: "rotate(-90deg) scale(0.8)", opacity: 0.6 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: CHOICES_MS / 2, easing: SPRING },
		);
		const area = surface.getBoundingClientRect();
		const boxes = choices.map((choice) => choice.getBoundingClientRect());
		const first = boxes[0];
		const last = boxes[boxes.length - 1];
		const span = last.right - first.left;
		const share = span / choices.length;
		const color = getComputedStyle(choices[0]).backgroundColor;
		const half = CHOICES_MS / 2;
		const blob = surface.createDiv("th-blob");
		blob.style.background = color;
		const start = origin ?? first;
		blob.animate(
			[
				{ left: `${start.left - area.left}px`, top: `${start.top - area.top}px`, width: `${start.width}px`, height: `${start.height}px`, borderRadius: `${start.height / 2}px` },
				{ left: `${first.left - area.left}px`, top: `${first.top - area.top}px`, width: `${span}px`, height: `${first.height}px`, borderRadius: `${first.height / 2}px` },
			],
			{ duration: half, easing: SPRING, fill: "forwards" },
		)
			.finished.then(() => blob.remove(), () => blob.remove());
		choices.forEach((choice, index) => {
			const box = boxes[index];
			const fromLeft = first.left + share * index;
			const dx = fromLeft + share / 2 - (box.left + box.width / 2);
			const radius = box.height / 2;
			const corners = index === 0 ? `${radius}px 0 0 ${radius}px` : index === choices.length - 1 ? `0 ${radius}px ${radius}px 0` : "0";
			const own = getComputedStyle(choice);
			choice.animate(
				[
					{ transform: `translateX(${dx}px) scaleX(${share / box.width})`, borderRadius: corners, backgroundColor: color, boxShadow: "none", opacity: 0 },
					{ transform: `translateX(${dx}px) scaleX(${share / box.width})`, borderRadius: corners, backgroundColor: color, boxShadow: "none", opacity: 1, offset: 0.5 },
					{ transform: "none", borderRadius: `${radius}px`, backgroundColor: own.backgroundColor, boxShadow: own.boxShadow, opacity: 1 },
				],
				{ duration: CHOICES_MS, easing: SPRING, fill: "backwards" },
			);
			const label = choice.querySelector<HTMLElement>(".th-choice-pill-text");
			label?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: CHOICES_MS, fill: "backwards" });
		});
	}

	/** Closing the choices without an answer: the row's content slides back in. */
	refold(content: readonly HTMLElement[]): void {
		if (this.reduced()) return;
		for (const element of content) {
			element.animate(
				[
					{ transform: "translateX(24px)", opacity: 0 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: CHOICES_MS / 2, easing: SETTLE },
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
