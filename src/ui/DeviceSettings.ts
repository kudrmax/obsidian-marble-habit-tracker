const SCREEN_CORNERS = "marble-habit-tracker:screen-corners";

/** Settings that belong to the device itself rather than to a vault, so they stay out of the plugin data that syncs. */
export class DeviceSettings {
	private corners: number;

	constructor(private readonly onChange: () => void) {
		const stored = Number(read(SCREEN_CORNERS));
		this.corners = Number.isFinite(stored) && stored >= 0 ? stored : 0;
	}

	/** The radius of the screen's rounded corners in CSS pixels; 0 for square corners. */
	get screenCorners(): number {
		return this.corners;
	}

	setScreenCorners(radius: number): void {
		this.corners = radius;
		write(SCREEN_CORNERS, String(radius));
		this.onChange();
	}
}

function read(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Storage can be unavailable; the setting then lasts until Obsidian closes.
	}
}
