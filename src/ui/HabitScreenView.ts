import { ItemView, TFile, ViewStateResult } from "obsidian";

export const HABIT_VIEW = "tiny-habits-habit";

/** Habits used to open in their own screen; a tab restored from those days opens the habit's note instead. */
export class HabitScreenView extends ItemView {
	override getViewType(): string {
		return HABIT_VIEW;
	}

	override getDisplayText(): string {
		return "Habit";
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const path = (state as { path?: unknown } | null)?.path;
		const file = typeof path === "string" ? this.app.vault.getAbstractFileByPath(path) : null;
		if (file instanceof TFile) await this.leaf.openFile(file);
		else this.leaf.detach();
	}
}
