import { LocalDate } from "../domain/LocalDate";
import { MarkChange, changeText } from "./undo";

/**
 * The line that offers to undo the last answer: the habit, what happened to its day, and Undo; a tap anywhere else on
 * it puts it away. The habit and what happened share a line in a capsule; in the tray what happened goes under the
 * habit, so a long name never hides it.
 */
export function undoLine(change: MarkChange, today: LocalDate, onUndo: () => void, onDismiss: () => void): HTMLElement {
	const line = createDiv({ cls: "th-undo", attr: { role: "status" } });
	line.addEventListener("click", onDismiss);
	const { name, what } = changeText(change, today);
	const text = line.createSpan("th-undo-text");
	text.createSpan({ cls: "th-undo-name", text: name });
	text.createSpan({ cls: "th-undo-dot", text: " · " });
	text.createSpan({ cls: "th-undo-what", text: what });
	line.createEl("button", { cls: "th-undo-button", text: "Undo" }).addEventListener("click", (event) => {
		event.stopPropagation();
		onUndo();
	});
	return line;
}
