import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { HabitService } from "./application/HabitService";
import { DayStartClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { DayWatcher } from "./ui/DayWatcher";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HabitNotes } from "./ui/HabitNotes";
import { HABITS_VIEW, TodayView } from "./ui/TodayView";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";
import { DeviceSettings } from "./ui/DeviceSettings";
import { RecipeLabels } from "./ui/format";
import { UiContext } from "./ui/UiContext";

const DAY_CHECK_MS = 60_000;

export default class MarbleHabitTrackerPlugin extends Plugin implements SettingsHost {
	config: HabitSettings = loadSettings(null);
	newHabit: () => void = () => undefined;
	readonly device = new DeviceSettings(() => this.refreshViews());
	private notes: HabitNotes | null = null;
	/** Habits as of the last refresh, so a note that just stopped being a habit (lost its tag) still refreshes Today. */
	private habitPaths = new Set<string>();
	private listPaths: () => string[] = () => [];

	override async onload(): Promise<void> {
		this.config = loadSettings(await this.loadData());
		const repository = new FrontmatterHabitRepository(this.app, () => this.config, () => this.config.properties);
		const service = new HabitService(repository, new DayStartClock(() => this.config.dayStartHour));
		const ui: UiContext = {
			service,
			repository,
			settings: () => this.config,
			screenCorners: () => this.device.screenCorners,
			labels: () => new RecipeLabels(this.config.labels),
			openHabit: (path, leaf) => void this.openHabit(path, leaf),
			markHintsSeen: () => {
				if (this.config.hintsSeen) return;
				this.config.hintsSeen = true;
				void this.saveSettings();
			},
			newHabit: () => new HabitFormModal(this.app, service, new RecipeLabels(this.config.labels), this.config.notAtTrigger).open(),
		};
		this.newHabit = () => ui.newHabit();
		this.listPaths = () => repository.list().map((entry) => entry.path);
		this.habitPaths = new Set(this.listPaths());
		const notes = this.addChild(new HabitNotes(this.app, ui));
		this.notes = notes;

		this.registerView(HABITS_VIEW, (leaf) => new TodayView(leaf, ui));
		this.addRibbonIcon("sprout", "Habits", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Open habits", callback: () => void this.openGrid() });
		this.addCommand({ id: "open-all", name: "Open all habits", callback: () => void this.openGrid().then((view) => view?.showAll()) });
		this.addCommand({ id: "new", name: "New habit", callback: () => ui.newHabit() });
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
				this.config.habitBlock = !this.config.habitBlock;
				void this.saveSettings();
			},
		});
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => this.habitPaths.has(path) || repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => refreshIfHabit(file.path, oldPath)));
		const watcher = new DayWatcher(service, () => notes.refresh());
		this.registerInterval(window.setInterval(() => watcher.check(), DAY_CHECK_MS));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.config);
		this.refreshViews();
	}

	async calibrateMarbles(end: () => void): Promise<void> {
		const view = await this.openGrid();
		if (!view) {
			end();
			return;
		}
		view.calibrateMarbles((feel) => {
			this.config.marbleSizes = feel.sizes;
			this.config.speed = feel.speed;
			this.config.gravity = feel.gravity;
			this.config.bounce = feel.bounce;
			void this.saveSettings();
		}, end);
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
		this.habitPaths = new Set(this.listPaths());
		for (const view of this.todayViews()) view.refresh();
		this.notes?.refresh();
	}

	private async openGrid(): Promise<TodayView | null> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
		return leaf.view instanceof TodayView ? leaf.view : null;
	}

	private async openHabit(path: string, from?: WorkspaceLeaf): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await (from ?? this.app.workspace.getLeaf("tab")).openFile(file, { active: true });
	}
}
