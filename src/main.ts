import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { HabitService } from "./application/HabitService";
import { systemClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { DayWatcher } from "./ui/DayWatcher";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HabitNotes } from "./ui/HabitNotes";
import { HABIT_VIEW, HabitScreenView } from "./ui/HabitScreenView";
import { HABITS_VIEW, TodayView } from "./ui/TodayView";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";
import { UiContext } from "./ui/UiContext";

const DAY_CHECK_MS = 60_000;

export default class MarbleHabitTrackerPlugin extends Plugin implements SettingsHost {
	override settings: HabitSettings = loadSettings(null);
	newHabit: () => void = () => undefined;
	private notes: HabitNotes | null = null;

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		const repository = new FrontmatterHabitRepository(this.app, () => this.settings.folder, () => this.settings.properties);
		const service = new HabitService(repository, systemClock);
		const ui: UiContext = {
			service,
			repository,
			settings: () => this.settings,
			openHabit: (path, leaf) => void this.openHabit(path, leaf),
			newHabit: () => new HabitFormModal(this.app, service).open(),
		};
		this.newHabit = ui.newHabit;
		const notes = this.addChild(new HabitNotes(this.app, ui));
		this.notes = notes;

		this.registerView(HABITS_VIEW, (leaf) => new TodayView(leaf, ui));
		this.registerView(HABIT_VIEW, (leaf) => new HabitScreenView(leaf));
		this.addRibbonIcon("sprout", "Habits", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Open habits", callback: () => void this.openGrid() });
		this.addCommand({ id: "new", name: "New habit", callback: () => ui.newHabit() });
		this.addCommand({ id: "replay-jar", name: "Replay the marbles", callback: () => this.todayViews().forEach((view) => view.replayJar()) });
		this.addCommand({
			id: "archive-habit",
			name: "Archive this habit",
			checkCallback: (checking) => this.onActiveHabit(checking, false, (path) => void notes.setArchived(path, true)),
		});
		this.addCommand({
			id: "restore-habit",
			name: "Restore this habit",
			checkCallback: (checking) => this.onActiveHabit(checking, true, (path) => void notes.setArchived(path, false)),
		});
		this.addCommand({
			id: "toggle-habit-block",
			name: "Show or hide the habit block in habit notes",
			callback: () => {
				this.settings.habitBlock = !this.settings.habitBlock;
				void this.saveSettings();
			},
		});
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => refreshIfHabit(file.path, oldPath)));
		const watcher = new DayWatcher(service, () => notes.refresh());
		this.registerInterval(window.setInterval(() => watcher.check(), DAY_CHECK_MS));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private onActiveHabit(checking: boolean, archived: boolean, action: (path: string) => void): boolean {
		const path = this.notes?.activeHabit();
		if (!path || this.notes?.isArchived(path) !== archived) return false;
		if (!checking) action(path);
		return true;
	}

	private todayViews(): TodayView[] {
		return this.app.workspace
			.getLeavesOfType(HABITS_VIEW)
			.flatMap((leaf) => (leaf.view instanceof TodayView ? [leaf.view] : []));
	}

	private refreshViews(): void {
		for (const view of this.todayViews()) view.refresh();
		this.notes?.refresh();
	}

	private async openGrid(): Promise<void> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	private async openHabit(path: string, from?: WorkspaceLeaf): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await (from ?? this.app.workspace.getLeaf("tab")).openFile(file, { active: true });
	}
}
