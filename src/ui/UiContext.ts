import { RecipeLabels } from "./format";
import { WorkspaceLeaf } from "obsidian";
import { HabitService } from "../application/HabitService";
import { HabitRepository } from "../application/ports";
import { HabitSettings } from "../settings";

export interface UiContext {
	readonly service: HabitService;
	readonly repository: HabitRepository;
	settings(): HabitSettings;
	/** This device's screen corner radius, see `DeviceSettings`. */
	screenCorners(): number;
	/** The names of the recipe's parts, from settings. */
	labels(): RecipeLabels;
	openHabit(path: string, leaf?: WorkspaceLeaf): void;
	newHabit(): void;
	/** Remembers, in synced settings, that the help behind "?" was opened. */
	markHintsSeen(): void;
}
