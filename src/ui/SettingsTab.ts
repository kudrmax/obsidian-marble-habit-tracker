import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, HabitSettings } from "../settings";
import { JAR_MATERIALS, JarMaterial } from "./jar/JarAssets";

export interface SettingsHost {
	settings: HabitSettings;
	saveSettings(): Promise<void>;
}

const MATERIAL_NAMES: Record<JarMaterial, string> = { grain: "Grain", aura: "Aura", halftone: "Halftone" };

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: Plugin & SettingsHost,
	) {
		super(app, host);
	}

	override display(): void {
		const { containerEl, host } = this;
		containerEl.empty();
		const save = async (change: (settings: HabitSettings) => void) => {
			change(host.settings);
			await host.saveSettings();
		};

		new Setting(containerEl).setName("Jar").setHeading();
		new Setting(containerEl)
			.setName("Material")
			.setDesc("How your wins look when they pile up.")
			.addDropdown((dropdown) => {
				for (const material of JAR_MATERIALS) dropdown.addOption(material, MATERIAL_NAMES[material]);
				dropdown.setValue(host.settings.material).onChange((value) => save((settings) => (settings.material = value as JarMaterial)));
			});
		new Setting(containerEl)
			.setName("Celebration line")
			.setDesc("Your celebration phrase shows under the habit for two seconds.")
			.addToggle((toggle) => toggle.setValue(host.settings.celebrationLine).onChange((value) => save((settings) => (settings.celebrationLine = value))));
		new Setting(containerEl)
			.setName("Reduce motion")
			.setDesc("Wins appear in place instead of falling and merging.")
			.addToggle((toggle) => toggle.setValue(host.settings.reduceMotion).onChange((value) => save((settings) => (settings.reduceMotion = value))));

		new Setting(containerEl).setName("Habits").setHeading();
		new Setting(containerEl)
			.setName("Folder")
			.setDesc("One note per habit. Subfolders are ignored.")
			.addText((text) =>
				text.setValue(host.settings.folder).onChange((value) => save((settings) => (settings.folder = value.trim() || DEFAULT_SETTINGS.folder))),
			);
		new Setting(containerEl)
			.setName("Suggest a redesign")
			.setDesc("After this many “not today” in a row.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(host.settings.redesignThreshold)).onChange(async (value) => {
					const threshold = Number(value);
					if (!Number.isInteger(threshold) || threshold < 1) return;
					await save((settings) => (settings.redesignThreshold = threshold));
				});
			});
	}
}
