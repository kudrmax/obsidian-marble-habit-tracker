/** iOS's own curve for things settling into place, and a spring that overshoots a little. */
export const SETTLE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

/** A just-answered row stays on screen this long, so the filled circle is seen, then folds away. */
export const LEAVE_HOLD_MS = 420;
const LEAVE_FOLD_MS = 280;
export const LEAVE_MS = LEAVE_HOLD_MS + LEAVE_FOLD_MS;

const DAY_MS = 260;
const PUSH_MS = 380;
const GROW_MS = 300;
const BUMP_MS = 420;
/** How far a day's content comes in from, and All habits'; how much a bumped element grows. */
const DAY_DISTANCE = "28px";
const PUSH_DISTANCE = "36%";
const BUMP_SCALE = 1.08;
/**
 * The choices sliding into the row from past its left edge, and the circle and name fading where they are. Leaving,
 * they slide back out on the same curve, quick from the first frame, while the circle and the name fade straight in.
 */
const SLIDE_MS = 320;
const FADE_MS = 160;
/** A menu grows out of its control from this share of its size, and fades when it goes. */
const MENU_MS = 240;
const MENU_FROM = 0.5;
/** Long enough for any move a tap starts to have played out. */
export const SETTLE_MS = Math.max(SLIDE_MS, GROW_MS, LEAVE_FOLD_MS, MENU_MS);
/** How far past the view's edge the choices wait. */
const OFF_EDGE = 4;

/** Stepping a day back or forward, opening All habits, or going back from it. */
export type Slide = "earlier" | "later" | "push" | "pop";
/** The edge of the view the choices come in from: Today's left, or the grid's right, where its circles are. */
export type Side = "left" | "right";

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
		const distance = push ? PUSH_DISTANCE : DAY_DISTANCE;
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

	/** A menu grows out of the control it belongs to, from the point its transform-origin names, as on iOS. */
	popOut(menu: HTMLElement): void {
		if (this.reduced()) return;
		menu.animate(
			[
				{ opacity: 0, transform: `scale(${MENU_FROM})` },
				{ opacity: 1, transform: "none" },
			],
			{ duration: MENU_MS, easing: SETTLE },
		);
	}

	/** Something going away fades where it is; resolves when it has. */
	fadeOut(element: HTMLElement): Promise<void> {
		if (this.reduced()) return Promise.resolve();
		const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: SETTLE, fill: "forwards" });
		return animation.finished.then(
			() => undefined,
			() => undefined,
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
	 * The choices slide in ready-made: `bar` starts just past the left edge of `view`, the screen's on a phone or the tab's
	 * on a computer, where the row may start far from it, and moves into place in one move, while
	 * `content` — the circle and the name — fades where it is. Until the choices are in, a tap goes through them to the
	 * row, which brings the row back, so nothing passing under the finger gets picked. `stop` ends all of it at once and
	 * leaves the row as it is drawn. From the right `side`, the mirror of all that.
	 */
	slideChoices(bar: HTMLElement, content: readonly HTMLElement[], view: HTMLElement, side: Side = "left"): { stop(): void } {
		const running: Animation[] = [];
		const stop = () => {
			for (const animation of running) animation.cancel();
			bar.removeClass("is-arriving");
		};
		const first = bar.firstElementChild;
		const last = bar.lastElementChild;
		if (this.reduced() || !first || !last) return { stop };
		const edge = view.getBoundingClientRect();
		const offset = side === "left" ? edge.left - last.getBoundingClientRect().right - OFF_EDGE : edge.right - first.getBoundingClientRect().left + OFF_EDGE;
		bar.addClass("is-arriving");
		const slide = bar.animate([{ transform: `translateX(${offset}px)` }, { transform: "none" }], { duration: SLIDE_MS, easing: SETTLE });
		running.push(slide);
		for (const element of content) running.push(element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS }));
		slide.finished.then(
			() => bar.removeClass("is-arriving"),
			() => undefined,
		);
		return { stop };
	}

	/**
	 * Closing the choices without an answer: `choices`, a copy of them as they stood, slides from there back past the
	 * edge of `view` they came from, as far as they came, moving from the first frame, and the circle and the name fade in at once. Without a copy, they
	 * just fade in.
	 */
	refold(surface: HTMLElement, content: readonly HTMLElement[], choices: HTMLElement | null, view: HTMLElement, side: Side = "left"): void {
		if (this.reduced()) return;
		if (!choices) {
			for (const element of content) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
			return;
		}
		choices.addClass("is-leaving");
		surface.addClass("is-refolding");
		surface.append(choices);
		const first = choices.firstElementChild as HTMLElement | null;
		const last = choices.lastElementChild as HTMLElement | null;
		const from = new DOMMatrix(choices.style.transform).m41;
		const box = surface.getBoundingClientRect();
		const edge = view.getBoundingClientRect();
		const distance =
			side === "left"
				? last ? box.left - edge.left + last.offsetLeft + last.offsetWidth + OFF_EDGE : 0
				: first ? edge.right - box.left - first.offsetLeft + OFF_EDGE : 0;
		const to = side === "left" ? -distance : distance;
		const duration = distance > 0 ? SLIDE_MS * (Math.abs(to - from) / distance) : 0;
		for (const element of content) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
		const leave = choices.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration, easing: SETTLE, fill: "forwards" });
		leave.finished.then(
			() => {
				choices.remove();
				surface.removeClass("is-refolding");
			},
			() => undefined,
		);
	}

	/** A number that just grew swells for a moment, like a counter ticking up. */
	bump(element: HTMLElement): void {
		if (this.reduced()) return;
		element.animate([{ transform: "scale(1)" }, { transform: `scale(${BUMP_SCALE})` }, { transform: "scale(1)" }], { duration: BUMP_MS, easing: SPRING });
	}
}
