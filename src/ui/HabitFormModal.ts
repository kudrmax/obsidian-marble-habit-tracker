import { App } from "obsidian";
import { HabitService } from "../application/HabitService";
import { HabitColor } from "../domain/HabitColor";
import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { colorCircles, textField, weekdayCircles } from "./components";
import { partTitle } from "./format";
import { Sheet } from "./Sheet";

export class HabitFormModal extends Sheet {
	private anchor = "";
	private tiny = "";
	private full = "";
	private celebration = "";
	private name = "";
	private days: Weekday[] = [...WEEKDAYS];
	private color: HabitColor | undefined;

	constructor(
		app: App,
		private readonly service: HabitService,
	) {
		super(app, "New habit", undefined);
	}

	protected override fill(body: HTMLElement): void {
		const field = (label: string, placeholder: string, large: boolean, set: (value: string) => void) =>
			textField(body, {
				label,
				placeholder,
				large,
				onInput: (value) => {
					set(value);
					this.refreshReady();
				},
			});
		const first = field(partTitle("anchor"), "something I already do every day", true, (value) => (this.anchor = value));
		field(partTitle("tiny"), "the tiniest version", true, (value) => (this.tiny = value));
		field(`${partTitle("full")} · optional`, "the bigger version", false, (value) => (this.full = value));
		field(`${partTitle("celebration")} · optional`, "a word or a gesture, like “Yes!”", false, (value) => (this.celebration = value));
		field("Call it", "Read", false, (value) => (this.name = value));

		const days = body.createDiv("th-sheet-group");
		days.createDiv({ cls: "th-label", text: "Days" });
		weekdayCircles(days, this.days, (picked) => {
			this.days = picked;
			this.refreshReady();
		});
		const colors = body.createDiv("th-sheet-group");
		colors.createDiv({ cls: "th-label", text: "Color" });
		colorCircles(colors, this.color, (picked) => (this.color = picked));
		window.setTimeout(() => first.focus(), 0);
	}

	protected override isReady(): boolean {
		return [this.anchor, this.tiny, this.name].every((value) => value.trim()) && this.days.length > 0;
	}

	protected override submit(): Promise<unknown> {
		return this.service.create({
			name: this.name,
			anchor: this.anchor,
			tiny: this.tiny,
			full: this.full,
			celebration: this.celebration,
			days: this.days,
			color: this.color,
		});
	}
}
