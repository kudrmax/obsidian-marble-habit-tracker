export interface CelebrationInput {
	readonly title: string;
	readonly subtitle: string;
	readonly streak: number;
	readonly confetti: boolean;
}

const DURATION_MS = 1500;
const CONFETTI_PIECES = 28;

export function celebrate(input: CelebrationInput): void {
	const overlay = document.body.createDiv("th-celebration");
	if (input.confetti) {
		for (let index = 0; index < CONFETTI_PIECES; index++) {
			const piece = overlay.createSpan("th-confetti");
			piece.style.setProperty("--th-x", `${Math.random() * 100}%`);
			piece.style.setProperty("--th-delay", `${Math.floor(Math.random() * 300)}ms`);
			piece.style.setProperty("--th-hue", String(Math.floor(Math.random() * 360)));
			piece.style.setProperty("--th-turn", `${Math.floor(Math.random() * 720) - 360}deg`);
		}
	}
	const card = overlay.createDiv("th-celebration-card");
	card.createDiv("th-celebration-ring");
	card.createDiv({ cls: "th-celebration-title", text: input.title });
	card.createDiv({ cls: "th-muted", text: input.subtitle });
	if (input.streak > 0) card.createDiv({ cls: "th-muted", text: `серия ${input.streak}` });
	const close = () => overlay.remove();
	overlay.addEventListener("click", close);
	window.setTimeout(close, DURATION_MS);
}
