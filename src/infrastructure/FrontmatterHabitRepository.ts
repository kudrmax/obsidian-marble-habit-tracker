import { App, TFile, TFolder, getAllTags, normalizePath } from "obsidian";
import { HabitEntry, HabitRepository } from "../application/ports";
import { DomainError } from "../domain/DomainError";
import { Habit } from "../domain/Habit";
import { Frontmatter, HabitDecodeError, PropertyNames, decodeHabit, encodeHabit } from "./HabitCodec";

/** Which notes are habits: every note carrying a tag, or every note in a folder. New habits go to the folder either way; an empty folder is the vault root. */
export interface HabitScope {
	readonly source: "tag" | "folder";
	readonly tag: string;
	readonly folder: string;
}

export class FrontmatterHabitRepository implements HabitRepository {
	constructor(
		private readonly app: App,
		private readonly scope: () => HabitScope,
		private readonly keys: () => PropertyNames,
	) {}

	contains(path: string): boolean {
		if (!path.endsWith(".md")) return false;
		if (this.scope().source === "folder") return normalizePath(path.slice(0, Math.max(0, path.lastIndexOf("/")))) === this.folderPath();
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile && this.hasTag(file);
	}

	list(): HabitEntry[] {
		if (this.scope().source === "tag") return this.app.vault.getMarkdownFiles().filter((file) => this.hasTag(file)).map((file) => this.read(file));
		const folder = this.folder();
		if (!folder) return [];
		return folder.children
			.filter((child): child is TFile => child instanceof TFile && child.extension === "md")
			.map((file) => this.read(file));
	}

	get(path: string): HabitEntry | undefined {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? this.read(file) : undefined;
	}

	async update(path: string, change: (habit: Habit) => Habit): Promise<Habit> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new DomainError("Habit not found");
		let updated: Habit | undefined;
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
			updated = change(this.decodeFresh(file, frontmatter));
			encodeHabit(updated, frontmatter, this.keys());
		});
		if (!updated) throw new DomainError("Habit not found");
		return updated;
	}

	async create(habit: Habit): Promise<string> {
		const folder = this.folderPath();
		const path = normalizePath(`${folder}/${habit.name}.md`);
		if (this.app.vault.getAbstractFileByPath(path)) throw new DomainError(`Habit "${habit.name}" already exists`);
		if (!this.folder()) await this.app.vault.createFolder(folder);
		const file = await this.app.vault.create(path, "");
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
			encodeHabit(habit, frontmatter, this.keys());
			if (this.scope().source === "tag") frontmatter.tags = [this.tagName()];
		});
		return path;
	}

	private folderPath(): string {
		return normalizePath(this.scope().folder);
	}

	private folder(): TFolder | null {
		if (this.folderPath() === "/") return this.app.vault.getRoot();
		const folder = this.app.vault.getAbstractFileByPath(this.folderPath());
		return folder instanceof TFolder ? folder : null;
	}

	private tagName(): string {
		return this.scope().tag.replace(/^#/, "").trim();
	}

	/** The tag itself or any tag nested under it, like #marble-habit/health. */
	private hasTag(file: TFile): boolean {
		const wanted = `#${this.tagName()}`.toLowerCase();
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = (cache && getAllTags(cache)) ?? [];
		return tags.some((tag) => {
			const lower = tag.toLowerCase();
			return lower === wanted || lower.startsWith(`${wanted}/`);
		});
	}

	private decodeFresh(file: TFile, frontmatter: Record<string, unknown>): Habit {
		try {
			return decodeHabit(file.basename, frontmatter, this.keys());
		} catch (error) {
			if (error instanceof HabitDecodeError) throw new DomainError(`Habit can't be read: ${error.message}`);
			throw error;
		}
	}

	private read(file: TFile): HabitEntry {
		try {
			const habit = decodeHabit(file.basename, this.app.metadataCache.getFileCache(file)?.frontmatter, this.keys());
			return { kind: "ok", path: file.path, habit };
		} catch (error) {
			if (error instanceof HabitDecodeError) return { kind: "broken", path: file.path, name: file.basename, problem: error.message };
			throw error;
		}
	}
}
