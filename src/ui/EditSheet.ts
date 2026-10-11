import { App } from "obsidian";
import { HabitService } from "../application/HabitService";
import { Habit, TextPart } from "../domain/Habit";
import { HabitColor } from "../domain/HabitColor";
import { Weekday } from "../domain/LocalDate";
import { colorCircles, textField, weekdayCircles } from "./components";
import { RecipeLabels } from "./format";
import { Sheet } from "./Sheet";

export type EditTarget = TextPart | "schedule" | "color";

export class EditSheet extends Sheet {
	private text: string;
	private days: Weekday[];
	private color: HabitColor | undefined;

	constructor(
		app: App,
		private readonly service: HabitService,
		private readonly path: string,
		habit: Habit,
		private readonly target: EditTarget,
		private readonly labels: RecipeLabels,
	) {
		super(app, habit.name, habit.color);
		this.text = target === "schedule" || target === "color" ? "" : (habit.current(target) ?? "");
		this.days = habit.currentSchedule.weekdays;
		this.color = habit.color;
	}

	protected override fill(body: HTMLElement): void {
		const { target } = this;
		if (target === "schedule") {
			body.createDiv({ cls: "th-label", text: this.labels.title("schedule") });
			weekdayCircles(body, this.days, (days) => {
				this.days = days;
				this.refreshReady();
			});
			return;
		}
		if (target === "color") {
			body.createDiv({ cls: "th-label", text: "Color" });
			colorCircles(body, this.color, (color) => {
				this.color = color;
				this.refreshReady();
			});
			return;
		}
		const input = textField(body, {
			label: this.labels.title(target),
			value: this.text,
			hero: true,
			onInput: (value) => {
				this.text = value;
				this.refreshReady();
			},
		});
		window.setTimeout(() => input.focus(), 0);
	}

	protected override isReady(): boolean {
		if (this.target === "schedule") return this.days.length > 0;
		if (this.target === "color") return true;
		return this.text.trim().length > 0;
	}

	protected override submit(): Promise<unknown> {
		const { service, path, target } = this;
		if (target === "schedule") return service.replaceSchedule(path, this.days);
		if (target === "color") return service.setColor(path, this.color);
		return service.replaceText(path, target, this.text);
	}
}
