import { Habit } from "../../src/domain/Habit";
import { Frontmatter, decodeHabit } from "../../src/infrastructure/HabitCodec";

export function habitNote(name: string, extra: Frontmatter = {}): Habit {
	return decodeHabit(name, {
		schedule: [{ value: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], since: "2026-10-01" }],
		anchor: [{ value: "Поставлю кружку в раковину", since: "2026-10-01" }],
		tiny: [{ value: "2 приседания", since: "2026-10-01" }],
		...extra,
	});
}
