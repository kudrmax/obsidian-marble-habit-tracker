/** Physics always advances in 60 Hz steps, so marbles move the same on 60 Hz and 120 Hz screens. */
export const STEP_MS = 1000 / 60;
/** After a pause (hidden tab, slow frame) catch up at most this many steps instead of jumping. */
const MAX_STEPS_PER_FRAME = 4;

/** Turns frame timestamps into the number of 60 Hz physics steps owed: one per frame at 60 Hz, every other frame at 120 Hz. */
export class FixedStep {
	private last: number | null = null;
	private pending = 0;

	next(time: number): number {
		const elapsed = this.last === null ? STEP_MS : time - this.last;
		this.last = time;
		this.pending += Math.min(Math.max(elapsed, 0), STEP_MS * MAX_STEPS_PER_FRAME);
		const steps = Math.round(this.pending / STEP_MS);
		this.pending -= steps * STEP_MS;
		return steps;
	}

	/** The loop stopped: the next frame starts fresh instead of owing the idle time. */
	reset(): void {
		this.last = null;
		this.pending = 0;
	}
}
