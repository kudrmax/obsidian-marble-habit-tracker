import { Setting } from "obsidian";
import { JarSize } from "../domain/Jar";
import { DEFAULT_MARBLE_SIZES, MAX_MARBLE, MIN_MARBLE, MarbleSizes } from "./jar/JarAssets";

const SIZES: readonly JarSize[] = ["small", "medium", "big"];
const SIZE_NAMES: Record<JarSize, string> = { small: "Small", medium: "Medium", big: "Big" };

export interface SizeCalibrationHost {
	/** The marbles on screen take these sizes at once; nothing is saved yet. */
	try(sizes: MarbleSizes): void;
	/** The marbles on screen fall in again from the top. */
	drop(): void;
	save(sizes: MarbleSizes): void;
	/** The calibration is gone, saved or not: the marbles go back to the saved sizes. */
	end(): void;
}

/** Marble sizes picked by eye on Today itself: sliders over the real screen, the real marbles follow them. */
export class SizeCalibration {
	private readonly root: HTMLElement;
	private sizes: MarbleSizes;
	private ended = false;

	constructor(
		parent: HTMLElement,
		sizes: MarbleSizes,
		private readonly host: SizeCalibrationHost,
	) {
		this.sizes = sizes;
		this.root = parent.createDiv("th-size-calibration");
		this.root.createDiv({ cls: "th-size-calibration-title", text: "Marble sizes" });
		const setters = SIZES.map((size) => {
			let set: (value: number) => void = () => undefined;
			new Setting(this.root).setName(SIZE_NAMES[size]).addSlider((slider) => {
				slider
					.setLimits(MIN_MARBLE, MAX_MARBLE, 1)
					.setDynamicTooltip()
					.setInstant(true)
					.setValue(sizes[size])
					.onChange((value) => this.resize({ ...this.sizes, [size]: value }));
				set = (value) => slider.setValue(value);
			});
			return set;
		});
		const buttons = this.root.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Drop again" }).addEventListener("click", () => host.drop());
		buttons.createEl("button", { text: "Default sizes" }).addEventListener("click", () => {
			this.resize(DEFAULT_MARBLE_SIZES);
			SIZES.forEach((size, index) => setters[index](DEFAULT_MARBLE_SIZES[size]));
		});
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons.createEl("button", { cls: "mod-cta", text: "Save" }).addEventListener("click", () => {
			host.save(this.sizes);
			this.close();
		});
		document.addEventListener("keydown", this.onKey, true);
	}

	close(): void {
		if (this.ended) return;
		this.ended = true;
		document.removeEventListener("keydown", this.onKey, true);
		this.root.remove();
		this.host.end();
	}

	private resize(sizes: MarbleSizes): void {
		this.sizes = sizes;
		this.host.try(sizes);
	}

	private readonly onKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		event.preventDefault();
		this.close();
	};
}
