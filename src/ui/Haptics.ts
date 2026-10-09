const IMPACT_GAP_MS = 70;
const SOFTEST_IMPACT = 1.5;

export class Haptics {
	private lastImpact = 0;

	constructor(private readonly enabled: () => boolean) {}

	tap(): void {
		this.vibrate(12);
	}

	impact(strength: number): void {
		const now = performance.now();
		if (strength < SOFTEST_IMPACT || now - this.lastImpact < IMPACT_GAP_MS) return;
		this.lastImpact = now;
		this.vibrate(Math.round(Math.min(18, Math.max(4, strength * 2))));
	}

	merge(): void {
		this.vibrate([18, 40, 26]);
	}

	private vibrate(pattern: number | number[]): void {
		if (!this.enabled() || typeof navigator.vibrate !== "function") return;
		navigator.vibrate(pattern);
	}
}
