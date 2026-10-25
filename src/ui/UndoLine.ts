import { LocalDate } from "../domain/LocalDate";
import { MarkChange, changeText } from "./undo";

/** The line that offers to undo the last answer: the habit, what happened to its day, and Undo. */
export function undoLine(change: MarkChange, today: LocalDate, onUndo: () => void): HTMLElement {
	const line = createDiv({ cls: "th-undo", attr: { role: "status" } });
	const { name, what } = changeText(change, today);
	const text = line.createSpan("th-undo-text");
	text.createSpan({ cls: "th-undo-name", text: name });
	text.createSpan({ cls: "th-undo-what", text: ` · ${what}` });
	line.createEl("button", { cls: "th-undo-button", text: "Undo" }).addEventListener("click", onUndo);
	return line;
}
