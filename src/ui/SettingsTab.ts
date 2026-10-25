import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { JarSize } from "../domain/Jar";
import { PropertyNames } from "../infrastructure/HabitCodec";
import { DEFAULT_SETTINGS, HabitSettings, MAX_DAY_START, MAX_GRID_DAYS, MIN_GRID_DAYS, parseReasons } from "../settings";
import { DEFAULT_LABELS, LabelSet, RecipeLabels } from "./format";
import { Hsl, parseColor } from "./jar/color";
import { DEFAULT_MARBLE_SIZES, JAR_MATERIALS, JarMaterial, assetSvg } from "./jar/JarAssets";
import { CornerCalibration } from "./CornerCalibration";
import { DeviceSettings } from "./DeviceSettings";
import { FolderSuggest, TagSuggest } from "./suggest";

export interface SettingsHost {
	config: HabitSettings;
	saveSettings(): Promise<void>;
	newHabit(): void;
	/** Opens Today with the marble sliders over it; `end` runs once they are saved or cancelled. */
	calibrateMarbles(end: () => void): Promise<void>;
	readonly device: DeviceSettings;
}

/** Obsidian's settings window, which the public API doesn't expose. */
interface SettingsWindow {
	open(): void;
	close(): void;
	openTabById(id: string): void;
}

const MATERIAL_NAMES: Record<JarMaterial, string> = { grain: "Grain", aura: "Aura", halftone: "Halftone" };
const PREVIEW: ReadonlyArray<{ color: string; size: JarSize; full: boolean }> = [
	{ color: "--color-purple", size: "big", full: false },
	{ color: "--color-green", size: "medium", full: false },
	{ color: "--color-orange", size: "small", full: true },
];
const LABEL_PARTS: ReadonlyArray<{ part: keyof LabelSet; name: string }> = [
	{ part: "full", name: "Action" },
	{ part: "tiny", name: "Tiny action" },
	{ part: "anchor", name: "Trigger" },
	{ part: "celebration", name: "Celebration" },
	{ part: "schedule", name: "Days" },
];
const PROPERTY_NAMES: Record<Exclude<keyof PropertyNames, keyof LabelSet>, string> = {
	doneTiny: "Days done tiny",
	doneFull: "Days done",
	missed: "Skipped days",
	offTrigger: "Days not at trigger",
	anytime: "Can be done without the trigger",
	color: "Color",
	order: "Order",
	section: "Section",
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
		this.habits(containerEl);
		this.today(containerEl);
		this.skipped(containerEl);
		this.marbles(containerEl);
		this.labels(containerEl);
		this.properties(containerEl);
	}

	/** Closes the settings for something done on Today, and gives the way back to this spot in them. */
	private stepOut(away: (back: () => void) => void): void {
		const window = (this.app as unknown as { setting: SettingsWindow }).setting;
		const scrolled = this.containerEl.scrollTop;
		window.close();
		away(() => {
			window.open();
			window.openTabById(this.host.manifest.id);
			this.containerEl.scrollTop = scrolled;
		});
	}

	private async save(change: (settings: HabitSettings) => void): Promise<void> {
		change(this.host.config);
		await this.host.saveSettings();
	}

	private marbles(containerEl: HTMLElement): void {
		const settings = this.host.config;
		new Setting(containerEl).setName("Marbles").setHeading();
		new Setting(containerEl).setName("Style").setDesc("How your marbles look.");
		this.stylePicker(containerEl);
		const sizes = settings.marbleSizes;
		new Setting(containerEl)
			.setName("Size and physics")
			.setDesc(
				`Tune them on Today, on your own marbles. Now: ${sizes.small}, ${sizes.medium} and ${sizes.big} px, speed ${settings.speed}%, gravity ${settings.gravity} px/s², bounce ${settings.bounce}%. A wide tab on a computer draws them bigger, in proportion.`,
			)
			.addButton((button) => button.setButtonText("Tune").onClick(() => this.stepOut((back) => void this.host.calibrateMarbles(back))));
		const merge = (name: string, desc: string, key: keyof HabitSettings["merge"]) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addSlider((slider) =>
					slider
						.setLimits(2, 30, 1)
						.setDynamicTooltip()
						.setValue(settings.merge[key])
						.onChange((value) => void this.save((next) => (next.merge = { ...next.merge, [key]: value }))),
				);
		merge("Small to medium", `How many small marbles of one habit merge into a medium one. Default ${DEFAULT_SETTINGS.merge.smallPerMedium}.`, "smallPerMedium");
		merge("Medium to big", `How many medium marbles merge into a big one. Default ${DEFAULT_SETTINGS.merge.mediumPerBig}.`, "mediumPerBig");
		new Setting(containerEl)
			.setName("Tilt to roll")
			.setDesc("On a phone, marbles roll the way you tilt it.")
			.addToggle((toggle) => toggle.setValue(settings.tilt).onChange((value) => void this.save((next) => (next.tilt = value))));
		const corners = this.host.device.screenCorners;
		new Setting(containerEl)
			.setName("Screen corners")
			.setDesc(`Marbles roll along a phone's rounded screen corners instead of slipping behind them. Set on each device: now ${corners === 0 ? "square" : `${corners} px`}.`)
			.addButton((button) =>
				button.setButtonText("Calibrate").onClick(() =>
					new CornerCalibration(corners, settings.marbleSizes.medium, (radius) => {
						this.host.device.setScreenCorners(radius);
						this.display();
					}),
				),
			);
		new Setting(containerEl)
			.setName("Push with the mouse")
			.setDesc("On a computer, move the mouse through the marbles to push them around.")
			.addToggle((toggle) => toggle.setValue(settings.cursorPush).onChange((value) => void this.save((next) => (next.cursorPush = value))));
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
		const settings = this.host.config;
		new Setting(containerEl).setName("Today").setHeading();
		const hour = (value: number) => `${String(value).padStart(2, "0")}:00`;
		new Setting(containerEl)
			.setName("New day starts at")
			.setDesc(`For late nights: habits marked after midnight but before this hour count for the day before. Default ${hour(DEFAULT_SETTINGS.dayStartHour)}.`)
			.addDropdown((dropdown) => {
				for (let value = 0; value <= MAX_DAY_START; value++) dropdown.addOption(String(value), hour(value));
				dropdown.setValue(String(settings.dayStartHour)).onChange((value) => void this.save((next) => (next.dayStartHour = Number(value))));
			});
		new Setting(containerEl)
			.setName("Days on the week view")
			.setDesc(`How many days the week button shows, up to today. On a phone each extra day takes room from the habits' names. Default ${DEFAULT_SETTINGS.gridDays}.`)
			.addSlider((slider) =>
				slider
					.setLimits(MIN_GRID_DAYS, MAX_GRID_DAYS, 1)
					.setDynamicTooltip()
					.setValue(settings.gridDays)
					.onChange((value) => void this.save((next) => (next.gridDays = value))),
			);
		new Setting(containerEl)
			.setName("Fold answered habits")
			.setDesc("Done and skipped habits leave the list; the ✓ button above it says how many and shows them again.")
			.addToggle((toggle) => toggle.setValue(settings.hideDone).onChange((value) => void this.save((next) => (next.hideDone = value))));
		new Setting(containerEl)
			.setName("Celebration line")
			.setDesc("After you mark a habit, its celebration shows above the marbles for two seconds.")
			.addToggle((toggle) =>
				toggle.setValue(settings.celebrationLine).onChange((value) => void this.save((next) => (next.celebrationLine = value))),
			);
	}

	private skipped(containerEl: HTMLElement): void {
		const settings = this.host.config;
		new Setting(containerEl).setName("Skipped").setHeading();
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
			.setDesc("Also suggest a tinier habit after this many skips in a row.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(settings.redesignThreshold)).onChange((value) => {
					const threshold = Number(value);
					if (Number.isInteger(threshold) && threshold >= 1) void this.save((next) => (next.redesignThreshold = threshold));
				});
			});
	}

	private habits(containerEl: HTMLElement): void {
		const settings = this.host.config;
		new Setting(containerEl).setName("Habits").setHeading();
		new Setting(containerEl)
			.setName("Find habits by")
			.setDesc("A note is a habit when it has the tag, or when it lives in the folder.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("tag", "Tag")
					.addOption("folder", "Folder")
					.setValue(settings.source)
					.onChange(async (value) => {
						await this.save((next) => (next.source = value === "folder" ? "folder" : "tag"));
						this.display();
					}),
			);
		if (settings.source === "tag") {
			new Setting(containerEl)
				.setName("Tag")
				.setDesc("Notes with this tag, or a tag nested under it, are habits.")
				.addText((text) => {
					const save = (value: string) => void this.save((next) => (next.tag = value.trim().replace(/^#/, "") || DEFAULT_SETTINGS.tag));
					text.setPlaceholder(`#${DEFAULT_SETTINGS.tag}`).setValue(`#${settings.tag}`).onChange(save);
					new TagSuggest(this.app, text.inputEl, save);
				});
		}
		new Setting(containerEl)
			.setName(settings.source === "tag" ? "New habits are saved to" : "Folder")
			.setDesc(
				settings.source === "tag"
					? "The folder where a habit made with + gets its note."
					: "Every note in this folder is a habit, and new habits are saved here. Subfolders are ignored.",
			)
			.addText((text) => {
				const save = (value: string) => {
					if (value.trim()) void this.save((next) => (next.folder = value.trim()));
				};
				text.setPlaceholder(DEFAULT_SETTINGS.folder).setValue(settings.folder).onChange(save);
				new FolderSuggest(this.app, text.inputEl, save);
			});
		const trigger = new RecipeLabels(settings.labels).of("anchor");
		new Setting(containerEl)
			.setName(`Done without the ${trigger}`)
			.setDesc(`Lets a habit with a ${trigger} also be marked as done at another moment. Adds a switch to the habit, and to its answers a fourth one, Anytime, next to Full, Tiny and Skip.`)
			.addToggle((toggle) => toggle.setValue(settings.notAtTrigger).onChange((value) => void this.save((next) => (next.notAtTrigger = value))));
		new Setting(containerEl)
			.setName(`Not at the ${trigger} is a win`)
			.setDesc(`A day done not at the ${trigger} drops a marble and counts toward wins and streaks. When off, the day stays in the note but drops no marble and breaks the streak.`)
			.addToggle((toggle) => toggle.setValue(settings.wins.offTrigger).onChange((value) => void this.save((next) => (next.wins = { offTrigger: value }))));
		new Setting(containerEl)
			.setName("Habit block in notes")
			.setDesc("Show the recipe, progress and history at the top of each habit note, above your own text.")
			.addToggle((toggle) => toggle.setValue(settings.habitBlock).onChange((value) => void this.save((next) => (next.habitBlock = value))));
	}

	private labels(containerEl: HTMLElement): void {
		const settings = this.host.config;
		new Setting(containerEl)
			.setName("Field labels")
			.setDesc("What each part of a habit is called in forms and in the habit panel.")
			.setHeading();
		for (const { part, name } of LABEL_PARTS) {
			new Setting(containerEl).setName(name).addText((text) =>
				text
					.setPlaceholder(DEFAULT_LABELS[part])
					.setValue(settings.labels[part])
					.onChange((value) => void this.save((next) => (next.labels = { ...next.labels, [part]: value.trim() || DEFAULT_LABELS[part] }))),
			);
		}
	}

	private properties(containerEl: HTMLElement): void {
		const settings = this.host.config;
		new Setting(containerEl)
			.setName("Note properties")
			.setDesc("Where each part of a habit is stored in its note. Renaming here doesn't rename properties in notes you already have.")
			.setHeading();
		const labels = new RecipeLabels(settings.labels);
		const names: Record<keyof PropertyNames, string> = {
			...(Object.fromEntries(LABEL_PARTS.map(({ part }) => [part, labels.title(part)])) as Record<keyof LabelSet, string>),
			...PROPERTY_NAMES,
		};
		for (const key of Object.keys(names) as Array<keyof PropertyNames>) {
			new Setting(containerEl).setName(names[key]).addText((text) =>
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
				const diameter = DEFAULT_MARBLE_SIZES[sample.size];
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
			tile.toggleClass("is-selected", this.host.config.material === material);
			return tile;
		});
	}

	private resolve(variable: string): Hsl | null {
		const probe = this.containerEl.createSpan();
		probe.addClass("th-probe");
		probe.setCssProps({ color: `var(${variable})` });
		const value = getComputedStyle(probe).color;
		probe.remove();
		return parseColor(value);
	}
}
