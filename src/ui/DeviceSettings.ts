import { App } from "obsidian";

const SCREEN_CORNERS = "marble-habit-tracker:screen-corners";

/** Settings that belong to one device rather than to the vault, so they stay out of the plugin data that syncs. */
export class DeviceSettings {
	constructor(
		private readonly app: App,
		private readonly onChange: () => void,
	) {}

	/** The radius of the screen's rounded corners in CSS pixels; 0 for square corners. */
	get screenCorners(): number {
		const value: unknown = this.app.loadLocalStorage(SCREEN_CORNERS);
		return typeof value === "number" && value >= 0 ? value : 0;
	}

	setScreenCorners(radius: number): void {
		this.app.saveLocalStorage(SCREEN_CORNERS, radius);
		this.onChange();
	}
}
