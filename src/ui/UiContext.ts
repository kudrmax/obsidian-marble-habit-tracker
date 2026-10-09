import { HabitService } from "../application/HabitService";
import { HabitRepository } from "../application/ports";
import { HabitSettings } from "../settings";

export interface UiContext {
	readonly service: HabitService;
	readonly repository: HabitRepository;
	settings(): HabitSettings;
	openHabit(path: string): void;
	newHabit(): void;
}
