import { App, Component, MarkdownView, Menu, Notice, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { EditSheet } from "./EditSheet";
import { HabitBlock } from "./HabitBlock";
import { UiContext } from "./UiContext";

const NOTE_CLASS = "th-habit-note";
/** A property the habit block already shows, hidden from the note's Properties panel. */
const OWN_PROPERTY = "th-own-property";
/** A Properties panel with nothing but the habit's own properties, hidden whole. */
const ONLY_OWN = "th-only-own";

interface Placed {
	readonly view: MarkdownView;
	readonly source: HabitBlock;
	readonly reading: HabitBlock;
	readonly observer: MutationObserver;
}

/**
 * Turns every note in the habits folder into a habit page: the habit block sits at the top of the note,
 * in both editing and reading mode, and the habit's own properties are hidden from the Properties panel.
 */
export class HabitNotes extends Component {
	private readonly placed = new Map<WorkspaceLeaf, Placed>();

	constructor(
		private readonly app: App,
		private readonly ui: UiContext,
	) {
		super();
	}

	override onload(): void {
		const sync = () => this.sync();
		this.registerEvent(this.app.workspace.on("layout-change", sync));
		this.registerEvent(this.app.workspace.on("file-open", sync));
		this.registerEvent(this.app.workspace.on("active-leaf-change", sync));
		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => this.fileMenu(menu, file)));
		this.app.workspace.onLayoutReady(sync);
		this.refresh();
	}

	override onunload(): void {
		for (const leaf of [...this.placed.keys()]) this.release(leaf);
	}

	/** Re-draws every habit block and re-applies the hidden properties, after data or settings change. */
	refresh(): void {
		this.sync();
		for (const placed of this.placed.values()) {
			placed.source.render();
			placed.reading.render();
			this.hideOwnProperties(placed.view);
		}
	}

	activeHabit(): string | null {
		const file = this.app.workspace.getActiveFile();
		return file && this.ui.repository.contains(file.path) ? file.path : null;
	}

	private sync(): void {
		const seen = new Set<WorkspaceLeaf>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) return;
			if (!this.ui.settings().habitBlock || !this.ui.repository.contains(view.file.path)) return;
			seen.add(leaf);
			this.place(leaf, view, view.file.path);
		});
		for (const leaf of [...this.placed.keys()]) if (!seen.has(leaf)) this.release(leaf);
	}

	private place(leaf: WorkspaceLeaf, view: MarkdownView, path: string): void {
		let placed = this.placed.get(leaf);
		if (placed && placed.view !== view) {
			this.release(leaf);
			placed = undefined;
		}
		if (!placed) {
			const source = new HabitBlock(this.app, this.ui, path);
			const reading = new HabitBlock(this.app, this.ui, path);
			const observer = new MutationObserver(() => this.attach(view, source, reading));
			observer.observe(view.contentEl, { childList: true, subtree: true });
			placed = { view, source, reading, observer };
			this.placed.set(leaf, placed);
			source.render();
			reading.render();
		} else if (placed.source.file !== path) {
			placed.source.moveTo(path);
			placed.reading.moveTo(path);
		}
		view.containerEl.addClass(NOTE_CLASS);
		this.attach(view, placed.source, placed.reading);
	}

	private attach(view: MarkdownView, source: HabitBlock, reading: HabitBlock): void {
		const sizer = view.contentEl.querySelector<HTMLElement>(".markdown-source-view .cm-sizer");
		const content = sizer?.querySelector<HTMLElement>(":scope > .cm-contentContainer");
		if (sizer && content && source.el.nextElementSibling !== content) sizer.insertBefore(source.el, content);
		const header = view.contentEl.querySelector<HTMLElement>(".markdown-reading-view .markdown-preview-sizer > .mod-header");
		if (header && reading.el.parentElement !== header) header.appendChild(reading.el);
		this.hideOwnProperties(view);
	}

	private hideOwnProperties(view: MarkdownView): void {
		const own = new Set(Object.values<string>({ ...this.ui.settings().properties }).map((key) => key.toLowerCase()));
		for (const container of view.contentEl.querySelectorAll<HTMLElement>(".metadata-container:not(.th-habit-panel)")) {
			const properties = [...container.querySelectorAll<HTMLElement>(".metadata-property")];
			for (const property of properties) property.toggleClass(OWN_PROPERTY, own.has((property.dataset.propertyKey ?? "").toLowerCase()));
			container.toggleClass(ONLY_OWN, properties.every((property) => property.hasClass(OWN_PROPERTY)));
		}
	}

	private release(leaf: WorkspaceLeaf): void {
		const placed = this.placed.get(leaf);
		if (!placed) return;
		placed.observer.disconnect();
		placed.source.el.remove();
		placed.reading.el.remove();
		placed.view.containerEl.removeClass(NOTE_CLASS);
		this.placed.delete(leaf);
	}

	private fileMenu(menu: Menu, file: TAbstractFile): void {
		if (!(file instanceof TFile) || !this.ui.repository.contains(file.path)) return;
		const entry = this.ui.repository.get(file.path);
		if (entry?.kind !== "ok") return;
		const habit = entry.habit;
		menu.addItem((item) =>
			item
				.setTitle("Marble color")
				.setIcon("palette")
				.onClick(() => new EditSheet(this.app, this.ui.service, file.path, habit, "color", this.ui.labels()).open()),
		);
		menu.addItem((item) =>
			item
				.setTitle(habit.archived ? "Restore habit" : "Archive habit")
				.setIcon(habit.archived ? "archive-restore" : "archive")
				.onClick(() => void this.setArchived(file.path, !habit.archived)),
		);
	}

	async setArchived(path: string, archived: boolean): Promise<void> {
		try {
			await (archived ? this.ui.service.archive(path) : this.ui.service.restore(path));
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	isArchived(path: string): boolean {
		const entry = this.ui.repository.get(path);
		return entry?.kind === "ok" && entry.habit.archived;
	}
}
