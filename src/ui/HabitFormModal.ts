import { App, setIcon } from "obsidian";
import { HabitService } from "../application/HabitService";
import { HabitColor } from "../domain/HabitColor";
import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { colorCircles, textField, weekdayCircles } from "./components";
import { RecipeLabels } from "./format";
import { Sheet } from "./Sheet";

/** A plain habit needs a name, an action and days; the Tiny Habits recipe is an optional part that opens below. */
export class HabitFormModal extends Sheet {
	private name = "";
	private full = "";
	private anchor = "";
	private tiny = "";
	private celebration = "";
	private days: Weekday[] = [...WEEKDAYS];
	private color: HabitColor | undefined;
	private anytime = false;

	constructor(
		app: App,
		private readonly service: HabitService,
		private readonly labels: RecipeLabels,
		private readonly notAtTrigger: boolean,
	) {
		super(app, "New habit", undefined);
	}

	protected override fill(body: HTMLElement): void {
		const labels = this.labels;
		const field = (parent: HTMLElement, label: string, placeholder: string, set: (value: string) => void) =>
			textField(parent, {
				label,
				placeholder,
				large: true,
				onInput: (value) => {
					set(value);
					this.refreshReady();
				},
			});
		const name = field(body, "Name", "Read", (value) => (this.name = value));
		field(body, labels.title("full"), "the whole thing", (value) => (this.full = value));

		const days = body.createDiv("th-sheet-group");
		days.createDiv({ cls: "th-label", text: labels.title("schedule") });
		weekdayCircles(days, this.days, (picked) => {
			this.days = picked;
			this.refreshReady();
		});
		const colors = body.createDiv("th-sheet-group");
		colors.createDiv({ cls: "th-label", text: "Color" });
		colorCircles(colors, this.color, (picked) => (this.color = picked));

		this.renderRecipe(body, field);
		window.setTimeout(() => name.focus(), 0);
	}

	private renderRecipe(body: HTMLElement, field: (parent: HTMLElement, label: string, placeholder: string, set: (value: string) => void) => HTMLTextAreaElement): void {
		const labels = this.labels;
		const toggle = body.createEl("button", { cls: "th-disclosure", attr: { type: "button", "aria-expanded": "false" } });
		setIcon(toggle.createSpan("th-disclosure-icon"), "chevron-right");
		toggle.createSpan({ text: "Tiny Habits recipe" });
		toggle.createSpan({ cls: "th-disclosure-note", text: "optional" });
		const recipe = body.createDiv("th-form-recipe");
		recipe.hide();
		field(recipe, labels.title("anchor"), "something I already do every day", (value) => (this.anchor = value));
		field(recipe, labels.title("tiny"), "the tiniest version", (value) => (this.tiny = value));
		field(recipe, labels.title("celebration"), "a word or a gesture, like “Yes!”", (value) => (this.celebration = value));
		if (this.notAtTrigger) {
			const anytime = recipe.createEl("label", { cls: "th-check" });
			const box = anytime.createEl("input", { type: "checkbox" });
			anytime.createSpan({ text: "Can also be done without the trigger" });
			box.addEventListener("change", () => (this.anytime = box.checked));
		}
		toggle.addEventListener("click", () => {
			const open = !recipe.isShown();
			recipe.toggle(open);
			toggle.setAttribute("aria-expanded", String(open));
		});
	}

	protected override isReady(): boolean {
		return this.name.trim() !== "" && (this.full.trim() !== "" || this.tiny.trim() !== "") && this.days.length > 0;
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
			anytime: this.anytime,
		});
	}
}
