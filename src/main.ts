import { Plugin, WorkspaceLeaf } from "obsidian";
import { HabitService } from "./application/HabitService";
import { systemClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HABIT_VIEW, HabitScreenView } from "./ui/HabitScreenView";
import { HABITS_VIEW, TodayView } from "./ui/TodayView";
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
			openHabit: (path, leaf) => void this.openHabit(path, leaf),
			newHabit: () => new HabitFormModal(this.app, service).open(),
		};

		this.registerView(HABITS_VIEW, (leaf) => new TodayView(leaf, ui));
		this.registerView(HABIT_VIEW, (leaf) => new HabitScreenView(leaf, ui));
		this.addRibbonIcon("sprout", "Habits", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Open habits", callback: () => void this.openGrid() });
		this.addCommand({ id: "new", name: "New habit", callback: () => ui.newHabit() });
		this.addCommand({ id: "replay-jar", name: "Replay the jar", callback: () => this.todayViews().forEach((view) => view.replayJar()) });
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				for (const view of this.habitScreens()) view.renamed(oldPath, file.path);
				refreshIfHabit(file.path, oldPath);
			}),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private habitScreens(): HabitScreenView[] {
		return this.app.workspace
			.getLeavesOfType(HABIT_VIEW)
			.flatMap((leaf) => (leaf.view instanceof HabitScreenView ? [leaf.view] : []));
	}

	private todayViews(): TodayView[] {
		return this.app.workspace
			.getLeavesOfType(HABITS_VIEW)
			.flatMap((leaf) => (leaf.view instanceof TodayView ? [leaf.view] : []));
	}

	private refreshViews(): void {
		for (const view of this.todayViews()) view.refresh();
		for (const view of this.habitScreens()) view.refresh();
	}

	private async openGrid(): Promise<void> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	private async openHabit(path: string, from?: WorkspaceLeaf): Promise<void> {
		const leaf = from ?? this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: HABIT_VIEW, active: true, state: { path } });
	}
}
