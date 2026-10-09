import { setIcon } from "obsidian";
import { HABIT_COLORS, HabitColor } from "../domain/HabitColor";
import { SPARK_PATH, SPARK_PATH_SIZE, svg } from "./ChainRenderer";
import { colorClass } from "./colors";

export interface CelebrationInput {
	readonly title: string;
	readonly subtitle: string;
	readonly streak: number;
	readonly confetti: boolean;
	readonly full: boolean;
	readonly color?: HabitColor;
}

const CONFETTI_PIECES = 32;

export function celebrate(input: CelebrationInput): void {
	const overlay = document.body.createDiv({ cls: ["th-celebration", "th-habit", colorClass(input.color)] });
	if (input.confetti) {
		for (let index = 0; index < CONFETTI_PIECES; index++) {
			const color = HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)];
			const piece = overlay.createSpan({ cls: ["th-confetti", "th-habit", colorClass(color)] });
			piece.style.setProperty("--th-x", `${Math.random() * 100}%`);
			piece.style.setProperty("--th-delay", `${Math.floor(Math.random() * 250)}ms`);
			piece.style.setProperty("--th-turn", `${Math.floor(Math.random() * 720) - 360}deg`);
		}
	}
	const card = overlay.createDiv("th-celebration-card");
	const badge = card.createDiv("th-celebration-badge");
	if (input.full) {
		const half = SPARK_PATH_SIZE / 2;
		const icon = svg("svg", { class: "th-celebration-spark", viewBox: `${-half} ${-half} ${SPARK_PATH_SIZE} ${SPARK_PATH_SIZE}` });
		icon.append(svg("path", { d: SPARK_PATH }));
		badge.append(icon);
	} else {
		setIcon(badge, "check");
	}
	card.createDiv({ cls: "th-celebration-title", text: input.title });
	card.createDiv({ cls: "th-celebration-subtitle", text: input.subtitle });
	if (input.streak > 1) card.createDiv({ cls: "th-celebration-streak", text: `${input.streak}-day streak` });
	const close = () => overlay.remove();
	overlay.addEventListener("click", close);
	const duration = parseFloat(getComputedStyle(overlay).getPropertyValue("--th-celebration-ms"));
	window.setTimeout(close, duration);
}
