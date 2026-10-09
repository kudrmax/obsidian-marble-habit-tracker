import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, HabitSettings } from "../settings";

export interface SettingsHost {
	settings: HabitSettings;
	saveSettings(): Promise<void>;
}

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
		new Setting(containerEl)
			.setName("Habits folder")
			.setDesc("One note per habit. Subfolders are ignored.")
			.addText((text) =>
				text.setValue(host.settings.folder).onChange(async (value) => {
					host.settings.folder = value.trim() || DEFAULT_SETTINGS.folder;
					await host.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Suggest a redesign after")
			.setDesc("Number of misses in a row since the last success")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(host.settings.redesignThreshold)).onChange(async (value) => {
					const threshold = Number(value);
					if (!Number.isInteger(threshold) || threshold < 1) return;
					host.settings.redesignThreshold = threshold;
					await host.saveSettings();
				});
			});
		new Setting(containerEl).setName("Confetti").addToggle((toggle) =>
			toggle.setValue(host.settings.confetti).onChange(async (value) => {
				host.settings.confetti = value;
				await host.saveSettings();
			}),
		);
	}
}
