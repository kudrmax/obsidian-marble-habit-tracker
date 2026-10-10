const MAX_RADIUS = 100;
const BAND = 3;

/**
 * A full-screen check of the screen's corner radius: a bright band runs along the edge of the screen and a marble sits
 * in each corner. With the right radius the band is equally thin all around, corners included.
 */
export class CornerCalibration {
	private readonly root: HTMLElement;
	private radius: number;

	constructor(
		radius: number,
		marble: number,
		private readonly onSave: (radius: number) => void,
	) {
		this.radius = radius;
		this.root = document.body.createDiv("tiny-habits th-calibration");
		this.root.createDiv("th-calibration-screen");
		const corners = ["top-left", "top-right", "bottom-left", "bottom-right"].map((corner) => this.root.createDiv(`th-calibration-marble is-${corner}`));
		const panel = this.root.createDiv("th-calibration-panel");
		panel.createDiv({ cls: "th-calibration-title", text: "Screen corners" });
		panel.createDiv({ cls: "th-calibration-hint", text: "Move the slider until the yellow band is equally thin all around the screen, corners included." });
		const value = panel.createDiv("th-calibration-value");
		const row = panel.createDiv("th-calibration-row");
		const less = row.createEl("button", { text: "−", attr: { "aria-label": "Smaller" } });
		const slider = row.createEl("input", { type: "range", attr: { min: "0", max: String(MAX_RADIUS), step: "1" } });
		const more = row.createEl("button", { text: "+", attr: { "aria-label": "Larger" } });
		const actions = panel.createDiv("th-calibration-actions");
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
		save.addEventListener("click", () => {
			this.onSave(this.radius);
			this.close();
		});
		const show = (radius: number) => {
			this.radius = Math.max(0, Math.min(MAX_RADIUS, Math.round(radius)));
			slider.value = String(this.radius);
			value.setText(this.radius === 0 ? "Square corners" : `${this.radius} px`);
			this.root.style.setProperty("--th-corner", `${this.radius}px`);
			const r = marble / 2;
			const inset = this.radius > r ? this.radius - (this.radius - r) / Math.SQRT2 - r : 0;
			for (const corner of corners) corner.style.setProperty("--th-corner-inset", `${inset}px`);
		};
		slider.addEventListener("input", () => show(Number(slider.value)));
		less.addEventListener("click", () => show(this.radius - 1));
		more.addEventListener("click", () => show(this.radius + 1));
		this.root.style.setProperty("--th-band", `${BAND}px`);
		this.root.style.setProperty("--th-marble", `${marble}px`);
		show(radius);
		document.addEventListener("keydown", this.onKey, true);
	}

	close(): void {
		document.removeEventListener("keydown", this.onKey, true);
		this.root.remove();
	}

	private readonly onKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		event.preventDefault();
		this.close();
	};
}
