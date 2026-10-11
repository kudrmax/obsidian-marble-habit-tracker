import { App } from "obsidian";
import { HabitService } from "../application/HabitService";
import { HabitColor } from "../domain/HabitColor";
import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { colorCircles, textField, weekdayCircles } from "./components";
import { RecipeLabels } from "./format";
import { Sheet } from "./Sheet";

/** Which versions of the habit get tracked: only the tiny one, only the full one, or both. */
type Track = "tiny" | "full" | "both";
const TRACKS: ReadonlyArray<{ track: Track; label: string }> = [
	{ track: "tiny", label: "Tiny" },
	{ track: "full", label: "Full" },
	{ track: "both", label: "Both" },
];

export class HabitFormModal extends Sheet {
	private track: Track = "both";
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
		private readonly labels: RecipeLabels,
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
		const labels = this.labels;
		const tracks = body.createDiv("th-sheet-group");
		tracks.createDiv({ cls: "th-label", text: "Track" });
		const segments = tracks.createDiv("th-segmented");
		const first = field(`${labels.title("anchor")} · optional`, "something I already do every day", true, (value) => (this.anchor = value));
		const tiny = field(labels.title("tiny"), "the tiniest version", true, (value) => (this.tiny = value));
		const full = field(labels.title("full"), "the whole thing", true, (value) => (this.full = value));
		field(`${labels.title("celebration")} · optional`, "a word or a gesture, like “Yes!”", false, (value) => (this.celebration = value));
		const show = (track: Track) => {
			this.track = track;
			tiny.parentElement?.toggle(track !== "full");
			full.parentElement?.toggle(track !== "tiny");
			buttons.forEach((button, index) => button.toggleClass("is-selected", TRACKS[index].track === track));
			this.refreshReady();
		};
		const buttons = TRACKS.map(({ track, label }) => {
			const button = segments.createEl("button", { text: label, attr: { type: "button" } });
			button.addEventListener("click", () => show(track));
			return button;
		});
		show(this.track);
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
		const wanted = [this.name, ...(this.track !== "full" ? [this.tiny] : []), ...(this.track !== "tiny" ? [this.full] : [])];
		return wanted.every((value) => value.trim()) && this.days.length > 0;
	}

	protected override submit(): Promise<unknown> {
		return this.service.create({
			name: this.name,
			anchor: this.anchor,
			tiny: this.track === "full" ? undefined : this.tiny,
			full: this.track === "tiny" ? undefined : this.full,
			celebration: this.celebration,
			days: this.days,
			color: this.color,
		});
	}
}
