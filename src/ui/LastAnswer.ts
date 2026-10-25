import { MarkChange, nextChange } from "./undo";

/** How long the last answer stays on offer to undo. */
export const UNDO_MS = 5000;
/** How often its time is counted, and whether it is held: time while held doesn't count. */
export const HOLD_TICK_MS = 250;

/** The window's clock, or a stand-in for it. */
export interface LastAnswerTimers extends Pick<Window, "setTimeout" | "clearTimeout"> {
	now(): number;
}

const WINDOW_TIMERS: LastAnswerTimers = {
	setTimeout: (run: () => void, ms: number) => window.setTimeout(run, ms),
	clearTimeout: (id: number) => window.clearTimeout(id),
	now: () => performance.now(),
};

/**
 * The last answer given on Today, on offer to undo for UNDO_MS. A new answer takes its place and starts the time over.
 * Its time stops while something holds it, such as the tray moving under the finger, and goes on once it is let go.
 */
export class LastAnswer {
	private change: MarkChange | null = null;
	private timer = 0;
	private held: () => boolean = () => false;
	/** How much of its time is left, and when that was last counted. */
	private left = 0;
	private countedAt = 0;

	constructor(
		private readonly show: (change: MarkChange | null) => void,
		private readonly timers: LastAnswerTimers = WINDOW_TIMERS,
	) {}

	get current(): MarkChange | null {
		return this.change;
	}

	holdWhile(held: () => boolean): void {
		this.held = held;
	}

	offer(change: MarkChange): void {
		const next = nextChange(this.change, change);
		if (next === this.change) return;
		this.change = next;
		this.left = UNDO_MS;
		this.countedAt = this.timers.now();
		this.tick();
		this.show(next);
	}

	/** The answer to undo, once: it is no longer on offer. */
	take(): MarkChange | null {
		const change = this.change;
		this.dismiss();
		return change;
	}

	destroy(): void {
		this.timers.clearTimeout(this.timer);
	}

	private dismiss(): void {
		this.timers.clearTimeout(this.timer);
		if (!this.change) return;
		this.change = null;
		this.show(null);
	}

	private tick(): void {
		this.timers.clearTimeout(this.timer);
		this.timer = this.timers.setTimeout(() => this.count(), Math.min(HOLD_TICK_MS, this.left));
	}

	private count(): void {
		const now = this.timers.now();
		if (!this.held()) this.left -= now - this.countedAt;
		this.countedAt = now;
		if (this.left <= 0) this.dismiss();
		else this.tick();
	}
}
