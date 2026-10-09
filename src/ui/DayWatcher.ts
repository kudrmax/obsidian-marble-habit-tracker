import { Clock } from "../domain/Clock";
import { LocalDate } from "../domain/LocalDate";

export class DayWatcher {
	private day: LocalDate;

	constructor(
		private readonly clock: Clock,
		private readonly onNewDay: () => void,
	) {
		this.day = clock.today();
	}

	check(): void {
		const today = this.clock.today();
		if (today.equals(this.day)) return;
		this.day = today;
		this.onNewDay();
	}
}
