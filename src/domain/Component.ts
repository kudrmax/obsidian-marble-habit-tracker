import { DomainError } from "./DomainError";
import { LocalDate } from "./LocalDate";

export interface Version<T> {
	readonly value: T;
	readonly since: LocalDate;
	readonly replacedBecause?: string;
}

type Same<T> = (a: T, b: T) => boolean;

export class Component<T> {
	private constructor(
		private readonly list: readonly Version<T>[],
		private readonly same: Same<T>,
	) {}

	static of<T>(versions: readonly Version<T>[], same: Same<T> = Object.is): Component<T> {
		for (let index = 1; index < versions.length; index++) {
			const newer = versions[index - 1].since;
			const older = versions[index].since;
			if (newer.equals(older)) throw new DomainError("Две версии с одной датой since");
			if (newer.isBefore(older)) throw new DomainError("Версии должны идти от новой к старой");
		}
		return new Component([...versions], same);
	}

	static start<T>(value: T, since: LocalDate, same: Same<T> = Object.is): Component<T> {
		return new Component([{ value, since }], same);
	}

	static empty<T>(same: Same<T> = Object.is): Component<T> {
		return new Component<T>([], same);
	}

	get versions(): readonly Version<T>[] {
		return this.list;
	}

	get isEmpty(): boolean {
		return this.list.length === 0;
	}

	current(): T | undefined {
		return this.list[0]?.value;
	}

	at(date: LocalDate): T | undefined {
		return this.list.find((version) => !version.since.isAfter(date))?.value;
	}

	replace(value: T, today: LocalDate, because?: string): Component<T> {
		const [latest, ...older] = this.list;
		if (!latest) return new Component([{ value, since: today }], this.same);
		if (this.same(latest.value, value)) return this;
		if (today.isBefore(latest.since)) throw new DomainError("Нельзя заменить версию, которая начнётся в будущем");
		if (today.equals(latest.since)) return new Component([{ ...latest, value }, ...older], this.same);
		const reason = because?.trim();
		const retired: Version<T> = reason ? { ...latest, replacedBecause: reason } : latest;
		return new Component([{ value, since: today }, retired, ...older], this.same);
	}

	correct(value: T): Component<T> {
		const [latest, ...older] = this.list;
		if (!latest) throw new DomainError("Нечего исправлять");
		return new Component([{ ...latest, value }, ...older], this.same);
	}
}
