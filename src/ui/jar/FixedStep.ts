/** Physics always advances in 120 Hz steps, the speed the marbles were tuned at on a 120 Hz iPhone, on every screen. */
export const STEP_MS = 1000 / 120;
/** After a pause (hidden tab, slow frame) catch up at most this many steps instead of jumping. */
const MAX_STEPS_PER_FRAME = 8;

/** Turns frame timestamps into the number of 120 Hz physics steps owed: one per frame at 120 Hz, two per frame at 60 Hz. */
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
