import { Plugin } from "obsidian";
import { HabitService } from "./application/HabitService";
import { systemClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HABITS_VIEW, HabitsView } from "./ui/HabitsView";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";
import { UiContext } from "./ui/UiContext";

export default class TinyHabitsPlugin extends Plugin implements SettingsHost {
	override settings: HabitSettings = loadSettings(null);

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		const repository = new FrontmatterHabitRepository(this.app, () => this.settings.folder);
		const service = new HabitService(repository, systemClock);
		const ui: UiContext = {
			service,
			repository,
			settings: () => this.settings,
			openHabit: (path) => void this.app.workspace.openLinkText(path, "", "tab"),
			newHabit: () => new HabitFormModal(this.app, service).open(),
		};

		this.registerView(HABITS_VIEW, (leaf) => new HabitsView(leaf, ui));
		this.addRibbonIcon("sprout", "Привычки", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Открыть привычки", callback: () => void this.openGrid() });
		this.addCommand({ id: "new", name: "Новая привычка", callback: () => ui.newHabit() });
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => refreshIfHabit(file.path, oldPath)));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(HABITS_VIEW)) {
			if (leaf.view instanceof HabitsView) leaf.view.refresh();
		}
	}

	private async openGrid(): Promise<void> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}
}
