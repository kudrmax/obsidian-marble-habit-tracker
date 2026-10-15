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
/** The marble splitting into the choices: filling, rolling, swelling. */
const FILL_MS = 200;
const ROLL_MS = 360;
const ROLL_STAGGER_MS = 40;
const SWELL_MS = 300;
/** The skip marble is grey, as skipped days are. */
const SKIP_MARBLE = "rgb(142, 142, 147)";

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
	 * The choices arrive as the marble splits: the circle at `origin` fills into a marble, the marble splits into three
	 * of the same size that roll right to their places, and each swells into its button. Every step can be stopped
	 * half-way: `stop` ends all of it at once and leaves the row as it is drawn.
	 */
	splitMarble(surface: HTMLElement, content: readonly HTMLElement[], cancel: HTMLElement, choices: readonly HTMLElement[], origin: DOMRect | null): { stop(): void } {
		const running: Animation[] = [];
		const marbles: HTMLElement[] = [];
		let stopped = false;
		const stop = () => {
			stopped = true;
			for (const animation of running) animation.cancel();
			for (const marble of marbles) marble.remove();
			for (const choice of choices) choice.style.visibility = "";
		};
		if (this.reduced() || !origin || choices.length === 0) return { stop };
		const play = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
			const animation = element.animate(keyframes, options);
			running.push(animation);
			return animation.finished.then(() => !stopped, () => false);
		};
		const area = surface.getBoundingClientRect();
		const size = origin.width;
		const cx = origin.left - area.left + size / 2;
		const cy = origin.top - area.top + size / 2;
		const marble = (color: string) => {
			const element = surface.createDiv("th-marble");
			element.setCssProps({ left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, background: color });
			marbles.push(element);
			return element;
		};
		for (const element of content) {
			const isCircle = element.querySelector(".th-mark") !== null;
			void play(element, [{ opacity: isCircle ? 0 : 1 }, { opacity: 0 }], { duration: isCircle ? 1 : FILL_MS, fill: "forwards" });
		}
		void play(cancel, [{ opacity: 0, transform: "rotate(-90deg) scale(0.7)" }, { opacity: 1, transform: "none" }], { duration: FILL_MS * 1.6, easing: SETTLE });
		const colors = choices.map((choice) => getComputedStyle(choice).backgroundColor);
		const habit = colors[0];
		const marbleColor = (index: number) => (index === choices.length - 1 && choices.length > 1 ? SKIP_MARBLE : habit);
		for (const choice of choices) choice.style.visibility = "hidden";
		void (async () => {
			const whole = marble(habit);
			if (!(await play(whole, [{ transform: "scale(0.25)" }, { transform: "scale(1.12)", offset: 0.7 }, { transform: "none" }], { duration: FILL_MS, easing: SETTLE }))) return;
			whole.remove();
			const boxes = choices.map((choice) => choice.getBoundingClientRect());
			const balls = choices.map((_, index) => marble(marbleColor(index)));
			const rolls = balls.map((ball, index) => {
				const box = boxes[index];
				const distance = box.left - area.left + box.width / 2 - cx;
				const turn = (distance / (Math.PI * size)) * 360;
				return play(ball, [{ transform: "none" }, { transform: `translateX(${distance}px) rotate(${turn}deg)` }], { duration: ROLL_MS, delay: index * ROLL_STAGGER_MS, easing: SETTLE, fill: "forwards" });
			});
			if (!(await Promise.all(rolls)).every(Boolean)) return;
			const swells = choices.map((choice, index) => {
				const box = boxes[index];
				const inset = `inset(${(box.height - size) / 2}px ${(box.width - size) / 2}px round ${size / 2}px)`;
				choice.style.visibility = "";
				balls[index].remove();
				const label = choice.querySelector<HTMLElement>(".th-choice-pill-text");
				if (label) void play(label, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: SWELL_MS, delay: index * 30 });
				return play(choice, [{ clipPath: inset, backgroundColor: marbleColor(index) }, { clipPath: `inset(0px 0px round ${box.height / 2}px)`, backgroundColor: colors[index] }], { duration: SWELL_MS, delay: index * 30, easing: SPRING });
			});
			await Promise.all(swells);
		})();
		return { stop };
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
				{ duration: ROLL_MS * 0.6, easing: SETTLE },
			);
		}
	}

	/** A number that just grew swells for a moment, like a counter ticking up. */
	bump(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: BUMP_MS, easing: SPRING });
	}
}
