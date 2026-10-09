import { App, TFile, TFolder, normalizePath } from "obsidian";
import { HabitEntry, HabitRepository } from "../application/ports";
import { DomainError } from "../domain/DomainError";
import { Habit } from "../domain/Habit";
import { HabitDecodeError, decodeHabit, encodeHabit } from "./HabitCodec";

export class FrontmatterHabitRepository implements HabitRepository {
	constructor(
		private readonly app: App,
		private readonly folder: () => string,
	) {}

	contains(path: string): boolean {
		const parent = path.slice(0, Math.max(0, path.lastIndexOf("/")));
		return path.endsWith(".md") && parent === this.folderPath();
	}

	list(): HabitEntry[] {
		const folder = this.app.vault.getAbstractFileByPath(this.folderPath());
		if (!(folder instanceof TFolder)) return [];
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
		if (!(file instanceof TFile)) throw new DomainError("Привычка не найдена");
		let updated: Habit | undefined;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			updated = change(this.decodeFresh(file, frontmatter));
			encodeHabit(updated, frontmatter);
		});
		if (!updated) throw new DomainError("Привычка не найдена");
		return updated;
	}

	async create(habit: Habit): Promise<string> {
		const folder = this.folderPath();
		const path = normalizePath(`${folder}/${habit.name}.md`);
		if (this.app.vault.getAbstractFileByPath(path)) throw new DomainError(`Привычка «${habit.name}» уже есть`);
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		const file = await this.app.vault.create(path, "");
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => encodeHabit(habit, frontmatter));
		return path;
	}

	private folderPath(): string {
		return normalizePath(this.folder());
	}

	private decodeFresh(file: TFile, frontmatter: Record<string, unknown>): Habit {
		try {
			return decodeHabit(file.basename, frontmatter);
		} catch (error) {
			if (error instanceof HabitDecodeError) throw new DomainError(`Привычка не читается: ${error.message}`);
			throw error;
		}
	}

	private read(file: TFile): HabitEntry {
		try {
			const habit = decodeHabit(file.basename, this.app.metadataCache.getFileCache(file)?.frontmatter);
			return { kind: "ok", path: file.path, habit };
		} catch (error) {
			if (error instanceof HabitDecodeError) return { kind: "broken", path: file.path, name: file.basename, problem: error.message };
			throw error;
		}
	}
}
