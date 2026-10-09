import { LocalDate } from "../../src/domain/LocalDate";

export function d(text: string): LocalDate {
	const date = LocalDate.parse(text);
	if (!date) throw new Error(`Bad test date ${text}`);
	return date;
}
