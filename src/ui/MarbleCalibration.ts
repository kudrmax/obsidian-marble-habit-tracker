import { Setting } from "obsidian";
import { JarSize } from "../domain/Jar";
import { DEFAULT_SETTINGS, MAX_BOUNCE, MAX_SPEED, MIN_BOUNCE, MIN_SPEED, MarbleFeel, marbleFeel } from "../settings";
import { MAX_MARBLE, MIN_MARBLE } from "./jar/JarAssets";

export interface MarbleCalibrationHost {
	/** The marbles on screen take this feel at once; nothing is saved yet. */
	try(feel: MarbleFeel): void;
	/** The marbles on screen fall in again from the top. */
	drop(): void;
	save(feel: MarbleFeel): void;
	/** The calibration is gone, saved or not: the marbles go back to the saved feel. */
	end(): void;
}

interface Dial {
	readonly name: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly unit: string;
	read(feel: MarbleFeel): number;
	write(feel: MarbleFeel, value: number): MarbleFeel;
}

const SIZE_NAMES: Record<JarSize, string> = { small: "Small", medium: "Medium", big: "Big" };

const sizeDial = (size: JarSize): Dial => ({
	name: SIZE_NAMES[size],
	min: MIN_MARBLE,
	max: MAX_MARBLE,
	step: 1,
	unit: " px",
	read: (feel) => feel.sizes[size],
	write: (feel, value) => ({ ...feel, sizes: { ...feel.sizes, [size]: value } }),
});

const DIALS: readonly Dial[] = [
	sizeDial("small"),
	sizeDial("medium"),
	sizeDial("big"),
	{ name: "Speed", min: MIN_SPEED, max: MAX_SPEED, step: 5, unit: "%", read: (feel) => feel.speed, write: (feel, speed) => ({ ...feel, speed }) },
	{ name: "Bounce", min: MIN_BOUNCE, max: MAX_BOUNCE, step: 5, unit: "%", read: (feel) => feel.bounce, write: (feel, bounce) => ({ ...feel, bounce }) },
];

/** How the marbles look and move, picked on Today itself: sliders over the real screen, the real marbles follow them. */
export class MarbleCalibration {
	private readonly root: HTMLElement;
	private readonly setters: Array<(feel: MarbleFeel) => void> = [];
	private feel: MarbleFeel;
	private ended = false;

	constructor(
		parent: HTMLElement,
		feel: MarbleFeel,
		private readonly host: MarbleCalibrationHost,
	) {
		this.feel = feel;
		this.root = parent.createDiv("th-marble-calibration");
		const header = this.root.createDiv("th-marble-calibration-header");
		header.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		header.createDiv({ cls: "th-marble-calibration-title", text: "Marbles" });
		header.createEl("button", { cls: "mod-cta", text: "Save" }).addEventListener("click", () => {
			host.save(this.feel);
			this.close();
		});
		for (const dial of DIALS) this.dial(dial);
		const buttons = this.root.createDiv("th-marble-calibration-actions");
		buttons.createEl("button", { text: "Drop again" }).addEventListener("click", () => host.drop());
		buttons.createEl("button", { text: "Defaults" }).addEventListener("click", () => {
			this.change(marbleFeel(DEFAULT_SETTINGS));
			for (const set of this.setters) set(this.feel);
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

	private dial(dial: Dial): void {
		let move: (value: number) => void = () => undefined;
		const setting = new Setting(this.root).setName(dial.name);
		const label = (value: number) => setting.setDesc(`${value}${dial.unit}`);
		const show = (value: number) => {
			move(value);
			label(value);
		};
		setting.addSlider((slider) => {
			slider
				.setLimits(dial.min, dial.max, dial.step)
				.setDynamicTooltip()
				.setInstant(true)
				.setValue(dial.read(this.feel))
				.onChange((value) => {
					label(value);
					this.change(dial.write(this.feel, value));
				});
			move = (value) => slider.setValue(value);
		});
		label(dial.read(this.feel));
		const step = (by: number) => {
			const value = Math.max(dial.min, Math.min(dial.max, dial.read(this.feel) + by));
			show(value);
			this.change(dial.write(this.feel, value));
		};
		setting.controlEl.addClass("th-marble-stepper");
		setting.controlEl.prepend(this.stepButton("−", `Less: ${dial.name}`, () => step(-dial.step)));
		setting.controlEl.append(this.stepButton("+", `More: ${dial.name}`, () => step(dial.step)));
		this.setters.push((feel) => show(dial.read(feel)));
	}

	private stepButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = createEl("button", { cls: "th-marble-step", text, attr: { "aria-label": label } });
		button.addEventListener("click", onClick);
		return button;
	}

	private change(feel: MarbleFeel): void {
		this.feel = feel;
		this.host.try(feel);
	}

	private readonly onKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		event.preventDefault();
		this.close();
	};
}
