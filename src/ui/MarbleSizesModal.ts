import { App, Modal, Setting } from "obsidian";
import { HABIT_COLORS } from "../domain/HabitColor";
import { JarSize } from "../domain/Jar";
import { Hsl, parseColor } from "./jar/color";
import { DEFAULT_MARBLE_SIZES, JarMaterial, MAX_MARBLE, MIN_MARBLE, MarbleSizes } from "./jar/JarAssets";
import { JarCanvas, JarItem } from "./jar/JarCanvas";

const SAMPLE: ReadonlyArray<{ size: JarSize; count: number }> = [
	{ size: "small", count: 24 },
	{ size: "medium", count: 12 },
	{ size: "big", count: 5 },
];
const SIZE_NAMES: Record<JarSize, string> = { small: "Small", medium: "Medium", big: "Big" };

/** Marble sizes picked by eye: a jar of marbles that follows three sliders. */
export class MarbleSizesModal extends Modal {
	private jar: JarCanvas | null = null;
	private drop = 0;

	constructor(
		app: App,
		private sizes: MarbleSizes,
		private readonly material: JarMaterial,
		private readonly speed: number,
		private readonly onSave: (sizes: MarbleSizes) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("tiny-habits", "th-sizes");
		this.setTitle("Marble sizes");
		const stage = this.contentEl.createDiv("th-sizes-stage");
		this.jar = new JarCanvas(stage, this.options());
		this.pour();
		const sliders = (["small", "medium", "big"] as const).map((size) => {
			let set: (value: number) => void = () => undefined;
			new Setting(this.contentEl).setName(SIZE_NAMES[size]).addSlider((slider) => {
				slider
					.setLimits(MIN_MARBLE, MAX_MARBLE, 1)
					.setDynamicTooltip()
					.setValue(this.sizes[size])
					.onChange((value) => this.resize({ ...this.sizes, [size]: value }));
				set = (value) => slider.setValue(value);
			});
			return set;
		});
		const buttons = this.contentEl.createDiv("modal-button-container");
		buttons.createEl("button", { text: "Drop again" }).addEventListener("click", () => this.pour());
		buttons.createEl("button", { text: "Default sizes" }).addEventListener("click", () => {
			this.resize(DEFAULT_MARBLE_SIZES);
			(["small", "medium", "big"] as const).forEach((size, index) => sliders[index](DEFAULT_MARBLE_SIZES[size]));
		});
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttons.createEl("button", { cls: "mod-cta", text: "Save" }).addEventListener("click", () => {
			this.onSave(this.sizes);
			this.close();
		});
	}

	override onClose(): void {
		this.jar?.destroy();
		this.jar = null;
		this.contentEl.empty();
	}

	private resize(sizes: MarbleSizes): void {
		this.sizes = sizes;
		this.jar?.setOptions(this.options());
	}

	/** Empties the jar and drops a fresh handful of marbles of every size and habit color. */
	private pour(): void {
		if (!this.jar) return;
		this.drop++;
		const colors = HABIT_COLORS.map((color) => this.resolve(`var(--color-${color})`));
		const items: JarItem[] = SAMPLE.flatMap(({ size, count }) =>
			Array.from({ length: count }, (_, index) => ({
				key: `${this.drop}:${size}:${index}`,
				group: String(index % colors.length),
				color: colors[index % colors.length],
				size,
				full: index % 3 === 0,
				today: false,
			})),
		);
		this.jar.sync([], new Map());
		this.jar.sync(items, new Map());
	}

	private options() {
		return {
			material: this.material,
			background: this.resolve("var(--background-primary)"),
			reduceMotion: false,
			sizes: this.sizes,
			speed: this.speed,
			screenCorners: 0,
		};
	}

	private resolve(color: string): Hsl {
		const probe = this.contentEl.createSpan();
		probe.style.color = color;
		probe.style.display = "none";
		const value = getComputedStyle(probe).color;
		probe.remove();
		return parseColor(value) ?? { h: 0, s: 0, l: 50 };
	}
}
