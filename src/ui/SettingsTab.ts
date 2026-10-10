import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { JarSize } from "../domain/Jar";
import { PropertyNames } from "../infrastructure/HabitCodec";
import { DEFAULT_SETTINGS, HabitSettings, parseReasons } from "../settings";
import { Hsl, parseColor } from "./jar/color";
import { JAR_DIAMETER, JAR_MATERIALS, JarMaterial, assetSvg } from "./jar/JarAssets";

export interface SettingsHost {
	settings: HabitSettings;
	saveSettings(): Promise<void>;
	newHabit(): void;
}

const MATERIAL_NAMES: Record<JarMaterial, string> = { grain: "Grain", aura: "Aura", halftone: "Halftone" };
const PREVIEW: ReadonlyArray<{ color: string; size: JarSize; full: boolean }> = [
	{ color: "--color-purple", size: "big", full: false },
	{ color: "--color-green", size: "medium", full: false },
	{ color: "--color-orange", size: "small", full: true },
];
const PROPERTY_LABELS: Record<keyof PropertyNames, string> = {
	anchor: "After I (anchor)",
	tiny: "I will (tiny version)",
	full: "On a good day (bigger version)",
	celebration: "And celebrate",
	schedule: "Days",
	doneTiny: "Done days",
	doneFull: "Did-more days",
	missed: "Not-today days",
	color: "Color",
	order: "Order",
	archived: "Archived",
};

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: Plugin & SettingsHost,
	) {
		super(app, host);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("New habit")
			.setDesc("Write a new habit as a recipe. Also in the command palette: “New habit”.")
			.addButton((button) => button.setButtonText("New habit").setCta().onClick(() => this.host.newHabit()));
		this.marbles(containerEl);
		this.today(containerEl);
		this.notToday(containerEl);
		this.notes(containerEl);
	}

	private async save(change: (settings: HabitSettings) => void): Promise<void> {
		change(this.host.settings);
		await this.host.saveSettings();
	}

	private marbles(containerEl: HTMLElement): void {
		const settings = this.host.settings;
		new Setting(containerEl).setName("Marbles").setHeading();
		new Setting(containerEl).setName("Style").setDesc("How your marbles look.");
		this.stylePicker(containerEl);
		new Setting(containerEl)
			.setName("Marbles to merge")
			.setDesc(`How many marbles of one habit merge into a bigger one. Four bigger ones merge into the biggest. Default ${DEFAULT_SETTINGS.mergeSize}.`)
			.addSlider((slider) =>
				slider
					.setLimits(2, 30, 1)
					.setDynamicTooltip()
					.setValue(settings.mergeSize)
					.onChange((value) => void this.save((next) => (next.mergeSize = value))),
			);
		new Setting(containerEl)
			.setName("Tilt to roll")
			.setDesc("On a phone, marbles roll the way you tilt it.")
			.addToggle((toggle) => toggle.setValue(settings.tilt).onChange((value) => void this.save((next) => (next.tilt = value))));
		new Setting(containerEl)
			.setName("Vibration")
			.setDesc("A light tap when you mark a habit, when marbles bump and when they merge.")
			.addToggle((toggle) => toggle.setValue(settings.haptics).onChange((value) => void this.save((next) => (next.haptics = value))));
		new Setting(containerEl)
			.setName("Reduce motion")
			.setDesc("Marbles appear in place: no falling, bouncing, merging animation or tilt. For when motion is distracting or uncomfortable.")
			.addToggle((toggle) => toggle.setValue(settings.reduceMotion).onChange((value) => void this.save((next) => (next.reduceMotion = value))));
	}

	private today(containerEl: HTMLElement): void {
		const settings = this.host.settings;
		new Setting(containerEl).setName("Today").setHeading();
		new Setting(containerEl)
			.setName("Hide done habits")
			.setDesc("Done habits fold into one “N done” line you can open.")
			.addToggle((toggle) => toggle.setValue(settings.hideDone).onChange((value) => void this.save((next) => (next.hideDone = value))));
		new Setting(containerEl)
			.setName("Celebration line")
			.setDesc("After you mark a habit, its celebration shows for two seconds.")
			.addToggle((toggle) =>
				toggle.setValue(settings.celebrationLine).onChange((value) => void this.save((next) => (next.celebrationLine = value))),
			);
		new Setting(containerEl)
			.setName("Total wins")
			.setDesc("Show how many habits you've ever done under today's progress.")
			.addToggle((toggle) => toggle.setValue(settings.showWins).onChange((value) => void this.save((next) => (next.showWins = value))));
	}

	private notToday(containerEl: HTMLElement): void {
		const settings = this.host.settings;
		new Setting(containerEl).setName("Not today").setHeading();
		new Setting(containerEl)
			.setName("Reasons")
			.setDesc("Offered when you skip a habit, one per line. “Other…” is always there for anything else.")
			.addTextArea((area) => {
				area.inputEl.rows = 5;
				area.setValue(settings.missReasons.join("\n")).onChange((value) => {
					const reasons = parseReasons(value);
					if (reasons.length) void this.save((next) => (next.missReasons = reasons));
				});
			});
		new Setting(containerEl)
			.setName("Reason that offers a tinier habit")
			.setDesc("Skipping with this reason suggests making the habit smaller. Leave empty to turn off.")
			.addText((text) => text.setValue(settings.shrinkReason).onChange((value) => void this.save((next) => (next.shrinkReason = value.trim()))));
		new Setting(containerEl)
			.setName("Suggest a redesign")
			.setDesc("Also suggest a tinier habit after this many “not today” in a row.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(settings.redesignThreshold)).onChange((value) => {
					const threshold = Number(value);
					if (Number.isInteger(threshold) && threshold >= 1) void this.save((next) => (next.redesignThreshold = threshold));
				});
			});
	}

	private notes(containerEl: HTMLElement): void {
		const settings = this.host.settings;
		new Setting(containerEl).setName("Notes").setHeading();
		new Setting(containerEl)
			.setName("Folder")
			.setDesc("One note per habit. Subfolders are ignored.")
			.addText((text) => text.setValue(settings.folder).onChange((value) => void this.save((next) => (next.folder = value.trim() || DEFAULT_SETTINGS.folder))));
		new Setting(containerEl)
			.setName("Property names")
			.setDesc("Where each part of a habit is stored in the note's properties. Renaming here doesn't rename properties in notes you already have.");
		for (const key of Object.keys(PROPERTY_LABELS) as Array<keyof PropertyNames>) {
			new Setting(containerEl).setName(PROPERTY_LABELS[key]).addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.properties[key])
					.setValue(settings.properties[key])
					.onChange((value) => void this.save((next) => (next.properties = { ...next.properties, [key]: value.trim() || DEFAULT_SETTINGS.properties[key] }))),
			);
		}
	}

	private stylePicker(containerEl: HTMLElement): void {
		const picker = containerEl.createDiv("th-style-picker");
		const background = this.resolve("--background-primary") ?? { h: 0, s: 0, l: 12 };
		const tiles = JAR_MATERIALS.map((material) => {
			const tile = picker.createEl("button", { cls: "th-style-tile", attr: { "aria-label": MATERIAL_NAMES[material] } });
			const marbles = tile.createDiv("th-style-marbles");
			for (const sample of PREVIEW) {
				const color = this.resolve(sample.color) ?? { h: 258, s: 88, l: 66 };
				const diameter = JAR_DIAMETER[sample.size];
				const spec = { material, color, background, size: sample.size, full: sample.full };
				marbles.createEl("img", {
					attr: { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(assetSvg(spec, diameter * 2))}`, width: diameter, height: diameter, alt: "" },
				});
			}
			tile.createDiv({ cls: "th-style-name", text: MATERIAL_NAMES[material] });
			tile.addEventListener("click", () => {
				void this.save((next) => (next.material = material));
				tiles.forEach((other, index) => other.toggleClass("is-selected", JAR_MATERIALS[index] === material));
			});
			tile.toggleClass("is-selected", this.host.settings.material === material);
			return tile;
		});
	}

	private resolve(variable: string): Hsl | null {
		const probe = this.containerEl.createSpan();
		probe.style.color = `var(${variable})`;
		probe.style.display = "none";
		const value = getComputedStyle(probe).color;
		probe.remove();
		return parseColor(value);
	}
}
