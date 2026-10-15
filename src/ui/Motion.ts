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
/** The circle filling into a marble, and the marble rolling across the row and out of it. */
const FILL_MS = 120;
const PULL_MS = 520;
const REVEAL_MS = 180;
const REFOLD_MS = 220;
/**
 * The liquid the marble pulls the buttons out of: shapes are blurred and cut sharp again, so two close shapes melt
 * together. A neck thicker than NECK_MIN survives the cut; thinner, it breaks.
 */
const LIQUID_BLUR = 5;
const LIQUID_CUT = "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 -14";
const NECK = 11;
const NECK_MIN = 4;
/** How far behind the marble's centre a button's end trails, and how far past the button the neck holds before it breaks. */
const TRAIL = 9;
const PINCH = 16;
/** A button grows taller as it lengthens, from a sliver at its left end. */
const SLIVER = 12;
let liquids = 0;

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
	 * The choices arrive pulled by the marble: the circle at `origin` fills into a marble that rolls right across the row.
	 * Passing each button it pulls it out behind itself through a liquid neck — the button shows at its left end and
	 * stretches after the marble — and at the button's right end the neck thins and breaks, leaving the button ready.
	 * After the last one the marble rolls out of the row. `extras` show once all the buttons are out. `stop` ends all of
	 * it at once and leaves the row as it is drawn.
	 */
	pullChoices(surface: HTMLElement, content: readonly HTMLElement[], cancel: HTMLElement, choices: readonly HTMLElement[], extras: readonly HTMLElement[], origin: DOMRect | null): { stop(): void } {
		const running: Animation[] = [];
		const hidden = [...choices, ...extras];
		let stage: HTMLElement | null = null;
		let frame = 0;
		let stopped = false;
		const stop = () => {
			stopped = true;
			cancelAnimationFrame(frame);
			for (const animation of running) animation.cancel();
			stage?.remove();
			for (const element of hidden) element.style.visibility = "";
		};
		if (this.reduced() || !origin || choices.length === 0) return { stop };
		const play = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
			const animation = element.animate(keyframes, options);
			running.push(animation);
			return animation;
		};
		const area = surface.getBoundingClientRect();
		const size = origin.width;
		const start = origin.left - area.left + size / 2;
		const cy = origin.top - area.top + size / 2;
		for (const element of content) {
			const isCircle = element.querySelector(".th-mark") !== null;
			play(element, [{ opacity: isCircle ? 0 : 1 }, { opacity: 0 }], { duration: isCircle ? 1 : FILL_MS, fill: "forwards" });
		}
		play(cancel, [{ opacity: 0, transform: "rotate(-90deg) scale(0.7)" }, { opacity: 1, transform: "none" }], { duration: FILL_MS * 1.6, easing: SETTLE });
		const colors = choices.map((choice) => getComputedStyle(choice).backgroundColor);
		const buttons = choices.map((choice, index) => {
			const box = choice.getBoundingClientRect();
			return { choice, color: colors[index], left: box.left - area.left, width: box.width, height: box.height, middle: box.top - area.top + box.height / 2 };
		});
		for (const element of hidden) element.style.visibility = "hidden";

		stage = surface.createDiv("th-pull");
		const id = `th-liquid-${++liquids}`;
		const filter = stage.createSvg("svg", { cls: "th-pull-defs", attr: { "aria-hidden": "true" } }).createSvg("defs").createSvg("filter", { attr: { id } });
		filter.createSvg("feGaussianBlur", { attr: { in: "SourceGraphic", stdDeviation: String(LIQUID_BLUR) } });
		filter.createSvg("feColorMatrix", { attr: { mode: "matrix", values: LIQUID_CUT } });
		const liquid = stage.createDiv("th-pull-liquid");
		liquid.style.filter = `url(#${id})`;
		const place = (blob: HTMLElement, left: number, top: number, width: number, height: number) =>
			blob.setCssProps({ left: `${left}px`, top: `${top}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
		const drop = (blob: HTMLElement) => place(blob, 0, 0, 0, 0);
		// Under the marble the liquid is a touch larger, so after the cut it is just the marble's size and a neck meets its edge.
		const under = size + 4;
		const ball = liquid.createDiv("th-pull-blob");
		place(ball, start - under / 2, cy - under / 2, under, under);
		ball.style.opacity = "0";
		const habit = getComputedStyle(ball).backgroundColor;
		const marble = stage.createDiv("th-marble is-rolling");
		marble.setCssProps({ left: `${start - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, background: habit });
		const spin = marble.createDiv("th-marble-spin");
		const pulled = buttons.map((button) => {
			const body = liquid.createDiv("th-pull-blob");
			const neck = liquid.createDiv("th-pull-blob");
			drop(body);
			drop(neck);
			return { ...button, body, neck, done: false };
		});
		const reveal = (button: (typeof pulled)[number]) => {
			button.done = true;
			button.body.remove();
			button.neck.remove();
			button.choice.style.visibility = "";
			play(button.choice, [{ backgroundColor: habit }, { backgroundColor: button.color }], { duration: REVEAL_MS });
			for (const child of Array.from(button.choice.children)) if (child instanceof HTMLElement) play(child, [{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_MS * 0.8 });
		};
		const trail = size / 2 + TRAIL;
		const end = area.width + under;
		// Kicked off fast, so the first answer — the one picked most — is ready soonest; it still rolls as it leaves the row.
		const kick = (t: number) => 0.6 * (1 - (1 - t) ** 2) + 0.4 * t;
		const roll = (begun: number) => (now: number) => {
			if (stopped) return;
			const t = Math.min(1, (now - begun) / PULL_MS);
			const x = start + (end - start) * kick(t);
			place(ball, x - under / 2, cy - under / 2, under, under);
			marble.style.transform = `translateX(${x - start}px)`;
			spin.style.transform = `rotate(${((x - start) / (Math.PI * size)) * 360}deg)`;
			for (const button of pulled) {
				if (button.done) continue;
				const reach = x - trail;
				const width = Math.min(button.width, reach - button.left);
				if (width <= 2) continue;
				const height = Math.min(button.height, SLIVER + width * 0.6);
				place(button.body, button.left, button.middle - height / 2, width, height);
				const past = reach - (button.left + button.width);
				if (past >= PINCH) {
					reveal(button);
					continue;
				}
				const neck = past <= 0 ? NECK : NECK - (NECK - NECK_MIN) * (past / PINCH);
				const right = button.left + width;
				place(button.neck, right - 8, cy - neck / 2, x - right + 8, neck);
			}
			if (t < 1) {
				frame = requestAnimationFrame(roll(begun));
				return;
			}
			for (const button of pulled) if (!button.done) reveal(button);
			stage?.remove();
			for (const element of extras) {
				element.style.visibility = "";
				play(element, [{ opacity: 0 }, { opacity: 1 }], { duration: REVEAL_MS });
			}
		};
		play(marble, [{ transform: "scale(0.25)" }, { transform: "scale(1.1)", offset: 0.65 }, { transform: "none" }], { duration: FILL_MS, easing: SETTLE }).finished.then(
			() => {
				if (stopped) return;
				ball.style.opacity = "";
				frame = requestAnimationFrame((now) => roll(now)(now));
			},
			() => undefined,
		);
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
