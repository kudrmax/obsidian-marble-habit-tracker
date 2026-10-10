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
	}

	protected abstract options(): string[];

	protected override getSuggestions(query: string): string[] {
		const needle = query.trim().toLowerCase();
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

/** Suggests the vault's folders while typing a folder path. */
export class FolderSuggest extends ListSuggest {
	protected override options(): string[] {
		return this.app.vault
			.getAllFolders(false)
			.map((folder) => folder.path)
			.sort((a, b) => a.localeCompare(b));
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
