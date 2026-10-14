import { AbstractInputSuggest, App, getAllTags } from "obsidian";

const LIMIT = 50;

abstract class ListSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly onPick: (value: string) => void,
	) {
		super(app, input);
		this.limit = LIMIT;
		input.addEventListener("focus", () => {
			this.showEverything = true;
			input.dispatchEvent(new Event("input"));
		});
	}

	/** Focusing the field lists every option, whatever it already holds; typing then narrows the list. */
	private showEverything = false;

	protected abstract options(): string[];

	protected override getSuggestions(query: string): string[] {
		const needle = this.showEverything ? "" : query.trim().toLowerCase();
		this.showEverything = false;
		return this.options().filter((option) => option.toLowerCase().includes(needle));
	}

	override renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	override selectSuggestion(value: string): void {
		this.setValue(value);
		this.onPick(value);
		this.close();
	}
}

const ROOT = "/";

/** Suggests the vault's folders, the vault root first, while typing a folder path. */
export class FolderSuggest extends ListSuggest {
	protected override options(): string[] {
		const folders = this.app.vault
			.getAllFolders(false)
			.map((folder) => folder.path)
			.sort((a, b) => a.localeCompare(b));
		return [ROOT, ...folders];
	}

	override renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value === ROOT ? "/ (vault root)" : value);
	}
}

/** Suggests the tags used in the vault while typing a tag. */
export class TagSuggest extends ListSuggest {
	protected override options(): string[] {
		const tags = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			for (const tag of (cache && getAllTags(cache)) ?? []) tags.add(tag);
		}
		return [...tags].sort((a, b) => a.localeCompare(b));
	}
}
