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
/**
 * The choices rolling into the row: the circle becomes skip, then every choice rolls the same span of time and all of
 * them stop together. The others set off one after another from the left edge, nearest to skip first.
 */
const FILL_MS = 50;
const ROLL_MS = 280;
const FIRST_IN_MS = 55;
const NEXT_IN_MS = 40;
/** Where an incoming choice starts: just past the row's left edge. */
const OFF_EDGE = 4;
/** How far into its roll a choice with a word starts opening from its marble into the whole capsule. */
const OPEN_FROM = 0.55;
const REVEAL_MS = 140;
const REFOLD_MS = 220;

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
	 * The choices roll into place. The circle at `origin` fills into the last choice — skip — which rolls right to its
	 * place and pushes the name `push` px aside as it goes; the other choices roll in from the row's left edge behind it.
	 * Each choice turns by the distance it rolls and ends upright, and all of them stop at the same moment; a choice with
	 * a word rolls as its marble alone and opens into the whole capsule as it comes to rest. Only the marbles move:
	 * every button waits at its place from the first moment, so a tap where the circle was cancels at once.
	 * `extras` show once the choices are in. `stop` ends all of it at once and leaves the row as it is drawn.
	 */
	rollChoices(choices: readonly HTMLElement[], extras: readonly HTMLElement[], name: HTMLElement | null, push: number, origin: DOMRect | null): { stop(): void } {
		const running: Animation[] = [];
		let frame = 0;
		let stopped = false;
		const balls = choices.map((choice) => choice.querySelector<HTMLElement>(".th-choice-ball") ?? choice);
		const signs = choices.map((choice) => choice.querySelector<HTMLElement>(".th-mark"));
		const settle = () => {
			for (const element of [...balls, ...(name ? [name] : [])]) element.style.removeProperty("transform");
			for (const element of [...balls, ...extras]) element.style.removeProperty("visibility");
			for (const ball of balls) ball.style.removeProperty("--th-open");
			for (const sign of signs) sign?.style.removeProperty("--th-home");
			for (const sign of signs) sign?.style.removeProperty("--th-turn");
		};
		const stop = () => {
			stopped = true;
			cancelAnimationFrame(frame);
			for (const animation of running) animation.cancel();
			settle();
		};
		const last = balls.length - 1;
		const surface = choices[last]?.parentElement;
		if (this.reduced() || !origin || last < 0 || !surface) return { stop };
		const left = surface.getBoundingClientRect().left;
		const size = balls[last].getBoundingClientRect().height;
		const rollers = balls.map((ball, index) => {
			const box = ball.getBoundingClientRect();
			const centre = box.left + size / 2;
			const isSkip = index === last;
			const from = isSkip ? origin.left + origin.width / 2 - centre : -(centre - left + size / 2 + OFF_EDGE);
			// A sign that sits beside its word starts at the capsule's left end, where the marble is, and moves over as it opens.
			const home = (signs[index]?.getBoundingClientRect().left ?? box.left) - box.left;
			return { ball, sign: signs[index], from, home, rest: box.width - size, enter: isSkip ? 0 : FIRST_IN_MS + (last - 1 - index) * NEXT_IN_MS };
		});
		const out = (t: number) => 1 - (1 - t) ** 3;
		const place = (roller: (typeof rollers)[number], offset: number, open: number) => {
			roller.ball.style.transform = `translateX(${offset}px)`;
			roller.ball.style.setProperty("--th-open", String(open));
			roller.sign?.style.setProperty("--th-home", `${-roller.home * (1 - open)}px`);
			roller.sign?.style.setProperty("--th-turn", `${(offset / (Math.PI * size)) * 360}deg`);
		};
		// The name keeps clear of skip's right edge, which is its marble while it rolls and its capsule once it opens.
		const pushName = (offset: number, open: number) => {
			if (name) name.style.transform = `translateX(${Math.min(push, Math.max(0, push + offset - skip.rest * (1 - open)))}px)`;
		};
		const skip = rollers[last];
		for (const roller of rollers) if (roller !== skip) roller.ball.style.visibility = "hidden";
		for (const element of extras) element.style.visibility = "hidden";
		place(skip, skip.from, 0);
		pushName(skip.from, 0);
		const roll = (begun: number) => (now: number) => {
			if (stopped) return;
			const elapsed = now - begun;
			for (const roller of rollers) {
				if (elapsed < roller.enter) continue;
				const t = Math.min(1, (elapsed - roller.enter) / (ROLL_MS - roller.enter));
				const offset = roller.from * (1 - out(t));
				const open = out(Math.max(0, (t - OPEN_FROM) / (1 - OPEN_FROM)));
				roller.ball.style.removeProperty("visibility");
				place(roller, offset, open);
				if (roller === skip) pushName(offset, open);
			}
			if (elapsed < ROLL_MS) {
				frame = requestAnimationFrame(roll(begun));
				return;
			}
			settle();
			for (const element of extras) running.push(element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_MS }));
		};
		const fill = (skip.sign ?? skip.ball).animate([{ scale: "0.8" }, { scale: "1.08", offset: 0.6 }, { scale: "1" }], { duration: FILL_MS, easing: SETTLE });
		running.push(fill);
		fill.finished.then(
			() => {
				if (stopped) return;
				frame = requestAnimationFrame((now) => roll(now)(now));
			},
			() => undefined,
		);
		return { stop };
	}

	/** Closing the choices without an answer: the name slides back from where the choices pushed it, the circle shows again. */
	refold(content: readonly HTMLElement[], push: number): void {
		if (this.reduced()) return;
		for (const element of content) {
			const isCircle = element.querySelector(".th-mark") !== null;
			element.animate(
				isCircle
					? [{ transform: "scale(0.6)", opacity: 0 }, { transform: "none", opacity: 1 }]
					: [{ transform: `translateX(${push}px)` }, { transform: "none" }],
				{ duration: REFOLD_MS, easing: SETTLE },
			);
		}
	}

	/** A number that just grew swells for a moment, like a counter ticking up. */
	bump(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: BUMP_MS, easing: SPRING });
	}
}
