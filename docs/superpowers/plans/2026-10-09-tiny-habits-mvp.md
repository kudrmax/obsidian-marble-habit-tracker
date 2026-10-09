# Tiny Habits MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian-плагин «Tiny Habits» — трекер привычек по методу Фогга: сетка дней с цепочками, отметки нано / полное / «не получилось» с причиной, празднование, экран привычки со статистикой и историей рецепта; все данные во frontmatter заметок.

**Architecture:** Слои как в Quick Capture: `domain` (чистая неизменяемая логика без Obsidian), `application` (порт `HabitRepository` + `HabitService`), `infrastructure` (`HabitCodec` frontmatter↔домен и `FrontmatterHabitRepository` поверх `metadataCache`/`processFrontMatter`), `ui` (ItemView/Modal на чистом DOM). Домен и кодек покрыты юнит-тестами, UI проверяется вручную в Obsidian.

**Tech Stack:** TypeScript (strict), esbuild, vitest, Obsidian API 1.13, без UI-фреймворков.

**Spec:** `docs/superpowers/specs/2026-10-09-best-habit-experience-design.md`

**Repo:** `~/projects/obsidian-my-own-plugins/obsidian-tiny-habits`. Работать в ветке `mvp`, созданной от `design`: `git checkout -b mvp`. Коммитить после каждой задачи. Удалять файлы только через `trash`, не через `rm`.

## Global Constraints

- Напоминаний и уведомлений нет и не закладываются.
- Никакой «магии»: плагин не группирует, не делает выводов и не подсказывает, кроме правила «N "не получилось" подряд».
- Ключи frontmatter на английском: `order`, `schedule`, `anchor`, `tiny`, `full`, `celebration`, `done_tiny`, `done_full`, `missed`, `archived`; у версий — `value`, `since`, `replaced_because`; у пропусков — `date`, `reason`.
- Даты — `YYYY-MM-DD`, локальный календарный день, без времени.
- Списки версий и отметок пишутся от новых к старым.
- Запись frontmatter — только через `app.fileManager.processFrontMatter`. Тело заметки и неизвестные ключи не трогаются.
- Тексты UI на русском.
- Плагин: id `tiny-habits`, имя `Tiny Habits`, `isDesktopOnly: false`.
- Чистый TypeScript + DOM, без Svelte/React.
- Деплой — `npm run deploy` в `~/Obsidian/.obsidian/plugins/tiny-habits`.

## Review Focus

1. Frontmatter после ручной правки или git-merge: несортированные списки, `Date` вместо строки, одна дата в двух списках. Ожидается, что первые два случая читаются нормально и при записи нормализуются, а третий даёт битую строку с понятной причиной, без падения (Task 6).
2. Сохранение отметки не теряет чужие ключи frontmatter (`tags`, `aliases`) и не пишет `archived: false` (Task 6).
3. Смена расписания посреди истории: процент и серии за прошлые дни считаются по старому расписанию (Task 5).
4. Арифметика дат на границах месяца, года и перехода на летнее время даёт правильный календарный день (Task 1).
5. Пустой сегодняшний день не рвёт текущую серию и не портит процент, а пустой вчерашний запланированный рвёт (Task 5).

---

## Карта файлов

```
package.json, tsconfig.json, esbuild.config.mjs, vitest.config.mts, deploy.mjs,
manifest.json, versions.json, styles.css, .gitignore
src/
  main.ts
  settings.ts
  domain/
    DomainError.ts   LocalDate.ts   Clock.ts   Component.ts   Schedule.ts
    DayMark.ts       Habit.ts       Stats.ts   RedesignRule.ts
  application/
    ports.ts         HabitService.ts
  infrastructure/
    HabitCodec.ts    FrontmatterHabitRepository.ts
  ui/
    UiContext.ts  format.ts  order.ts  chain.ts  calendar.ts
    WeekdayPicker.ts  CelebrationOverlay.ts  MissReasonModal.ts  HabitFormModal.ts
    ComponentModal.ts  PartPickerModal.ts  SettingsTab.ts
    HabitsView.ts  HabitScreenView.ts
tests/
  support/dates.ts  support/habits.ts  support/InMemoryHabitRepository.ts
  LocalDate.test.ts  Component.test.ts  Schedule.test.ts  DayMark.test.ts
  Habit.test.ts  Stats.test.ts  RedesignRule.test.ts  HabitCodec.test.ts
  HabitService.test.ts  Settings.test.ts  format.test.ts  order.test.ts
  chain.test.ts  calendar.test.ts
```

---

### Task 1: Каркас проекта и LocalDate

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.mts`, `deploy.mjs`, `manifest.json`, `versions.json`, `styles.css` (пустой)
- Modify: `.gitignore`
- Create: `src/domain/DomainError.ts`, `src/domain/LocalDate.ts`, `src/domain/Clock.ts`
- Create: `tests/support/dates.ts`
- Test: `tests/LocalDate.test.ts`

**Interfaces:**
- Produces: `DomainError extends Error`; `WEEKDAYS: readonly ["mon","tue","wed","thu","fri","sat","sun"]`; `type Weekday`; класс `LocalDate` с методами `of(y,m,d)`, `parse(text): LocalDate | null`, `fromDate(date)`, геттерами `year`/`month`/`day`, методами `weekday()`, `addDays(n)`, `daysSince(other)`, `compare(other)`, `equals`, `isBefore`, `isAfter`, `toString()`; `interface Clock { today(): LocalDate }`; `systemClock`; тестовый хелпер `d(text): LocalDate`.

- [ ] **Step 1: Создать конфиги**

`package.json`:
```json
{
  "name": "obsidian-tiny-habits",
  "version": "0.1.0",
  "private": true,
  "main": "main.js",
  "scripts": {
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "dev": "node esbuild.config.mjs",
    "deploy": "npm run build && node deploy.mjs",
    "test": "vitest run"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^26.6.3",
    "esbuild": "^0.28.2",
    "obsidian": "^1.13.1",
    "typescript": "^7.0.2",
    "vitest": "^5.0.2"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "ES2021"],
    "strict": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.mts"]
}
```

`esbuild.config.mjs`:
```js
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
```

`vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { include: ["tests/**/*.test.ts"] },
});
```

`deploy.mjs`:
```js
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const target = join(process.env.VAULT ?? join(homedir(), "Obsidian"), ".obsidian", "plugins", id);
mkdirSync(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(file, join(target, file));
console.log(`Deployed to ${target}`);
```

`manifest.json`:
```json
{
  "id": "tiny-habits",
  "name": "Tiny Habits",
  "version": "0.1.0",
  "minAppVersion": "1.6.6",
  "description": "Habit tracker built around BJ Fogg's Tiny Habits method. Habits live in Markdown notes.",
  "author": "kudrmax",
  "authorUrl": "https://github.com/kudrmax",
  "isDesktopOnly": false
}
```

`versions.json`:
```json
{ "0.1.0": "1.6.6" }
```

`styles.css` — пустой файл. `.gitignore` — проверить, что там есть `node_modules`, `main.js`, `.superpowers`, `.DS_Store`.

Run: `npm install`
Expected: зависимости установлены, появился `package-lock.json`.

- [ ] **Step 2: Написать падающий тест**

`tests/support/dates.ts`:
```ts
import { LocalDate } from "../../src/domain/LocalDate";

export function d(text: string): LocalDate {
	const date = LocalDate.parse(text);
	if (!date) throw new Error(`Bad test date ${text}`);
	return date;
}
```

`tests/LocalDate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/domain/LocalDate";
import { d } from "./support/dates";

describe("LocalDate", () => {
	it("parses and formats ISO dates", () => {
		expect(LocalDate.parse("2026-10-09")?.toString()).toBe("2026-10-09");
		expect(LocalDate.of(2026, 1, 5).toString()).toBe("2026-01-05");
	});

	it("rejects malformed and impossible dates", () => {
		for (const text of ["2026-1-09", "2026-02-30", "09.10.2026", "", "2026-10-09T00:00"]) {
			expect(LocalDate.parse(text)).toBeNull();
		}
	});

	it("adds days across month, year and daylight saving boundaries", () => {
		expect(d("2026-01-31").addDays(1).toString()).toBe("2026-02-01");
		expect(d("2026-12-31").addDays(1).toString()).toBe("2027-01-01");
		expect(d("2026-03-28").addDays(2).toString()).toBe("2026-03-30");
		expect(d("2026-10-24").addDays(2).toString()).toBe("2026-10-26");
		expect(d("2026-03-01").addDays(-1).toString()).toBe("2026-02-28");
	});

	it("knows the weekday", () => {
		expect(d("2026-10-05").weekday()).toBe("mon");
		expect(d("2026-10-09").weekday()).toBe("fri");
		expect(d("2026-10-11").weekday()).toBe("sun");
	});

	it("compares dates", () => {
		expect(d("2026-10-09").isAfter(d("2026-10-08"))).toBe(true);
		expect(d("2026-10-08").isBefore(d("2026-10-09"))).toBe(true);
		expect(d("2026-10-09").equals(d("2026-10-09"))).toBe(true);
		expect(d("2026-10-09").daysSince(d("2026-10-01"))).toBe(8);
		expect(d("2026-10-01").compare(d("2026-10-09"))).toBeLessThan(0);
	});

	it("takes the local calendar day of a Date", () => {
		expect(LocalDate.fromDate(new Date(2026, 9, 9, 23, 59)).toString()).toBe("2026-10-09");
		expect(LocalDate.fromDate(new Date(2026, 9, 9, 0, 1)).toString()).toBe("2026-10-09");
	});
});
```

- [ ] **Step 3: Запустить и убедиться, что падает**

Run: `npx vitest run tests/LocalDate.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/LocalDate'`.

- [ ] **Step 4: Реализовать**

`src/domain/DomainError.ts`:
```ts
export class DomainError extends Error {}
```

`src/domain/LocalDate.ts`:
```ts
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export class LocalDate {
	private constructor(private readonly epochDay: number) {}

	static of(year: number, month: number, day: number): LocalDate {
		return new LocalDate(Math.round(Date.UTC(year, month - 1, day) / DAY_MS));
	}

	static parse(text: string): LocalDate | null {
		const match = ISO_DATE.exec(text);
		if (!match) return null;
		const date = LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
		return date.toString() === text ? date : null;
	}

	static fromDate(date: Date): LocalDate {
		return LocalDate.of(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}

	private get utc(): Date {
		return new Date(this.epochDay * DAY_MS);
	}

	get year(): number {
		return this.utc.getUTCFullYear();
	}

	get month(): number {
		return this.utc.getUTCMonth() + 1;
	}

	get day(): number {
		return this.utc.getUTCDate();
	}

	weekday(): Weekday {
		return WEEKDAYS[(this.utc.getUTCDay() + 6) % 7];
	}

	addDays(days: number): LocalDate {
		return new LocalDate(this.epochDay + days);
	}

	daysSince(other: LocalDate): number {
		return this.epochDay - other.epochDay;
	}

	compare(other: LocalDate): number {
		return this.epochDay - other.epochDay;
	}

	equals(other: LocalDate): boolean {
		return this.epochDay === other.epochDay;
	}

	isBefore(other: LocalDate): boolean {
		return this.epochDay < other.epochDay;
	}

	isAfter(other: LocalDate): boolean {
		return this.epochDay > other.epochDay;
	}

	toString(): string {
		return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}`;
	}
}
```

`src/domain/Clock.ts`:
```ts
import { LocalDate } from "./LocalDate";

export interface Clock {
	today(): LocalDate;
}

export const systemClock: Clock = { today: () => LocalDate.fromDate(new Date()) };
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run tests/LocalDate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Scaffold plugin project and add LocalDate"
```

---

### Task 2: Component — компонент с историей версий

**Files:**
- Create: `src/domain/Component.ts`
- Test: `tests/Component.test.ts`

**Interfaces:**
- Consumes: `LocalDate`, `DomainError` (Task 1).
- Produces:
```ts
interface Version<T> { readonly value: T; readonly since: LocalDate; readonly replacedBecause?: string }
class Component<T> {
  static of<T>(versions: readonly Version<T>[], same?: (a: T, b: T) => boolean): Component<T> // newest first, strictly decreasing since
  static start<T>(value: T, since: LocalDate, same?: (a: T, b: T) => boolean): Component<T>
  static empty<T>(same?: (a: T, b: T) => boolean): Component<T>
  get versions(): readonly Version<T>[]
  get isEmpty(): boolean
  current(): T | undefined
  at(date: LocalDate): T | undefined
  replace(value: T, today: LocalDate, because?: string): Component<T>
  correct(value: T): Component<T>
}
```

- [ ] **Step 1: Написать падающий тест**

`tests/Component.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Component } from "../src/domain/Component";
import { DomainError } from "../src/domain/DomainError";
import { d } from "./support/dates";

describe("Component", () => {
	const coffee = Component.start("Выпью кофе", d("2026-09-01"));

	it("puts a replacement on top and stores the reason on the retired version", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "  размытый якорь ");
		expect(next.versions).toEqual([
			{ value: "Поставлю кружку", since: d("2026-09-20") },
			{ value: "Выпью кофе", since: d("2026-09-01"), replacedBecause: "размытый якорь" },
		]);
		expect(next.current()).toBe("Поставлю кружку");
		expect(coffee.current()).toBe("Выпью кофе");
	});

	it("does not store a blank reason", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "   ");
		expect(next.versions[1]).toEqual({ value: "Выпью кофе", since: d("2026-09-01") });
	});

	it("overwrites a version replaced on the day it started", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-01"), "передумал");
		expect(next.versions).toEqual([{ value: "Поставлю кружку", since: d("2026-09-01") }]);
	});

	it("ignores a replacement with the same value", () => {
		expect(coffee.replace("Выпью кофе", d("2026-09-20"))).toBe(coffee);
	});

	it("refuses to replace a version that starts in the future", () => {
		expect(() => coffee.replace("x", d("2026-08-01"))).toThrow(DomainError);
	});

	it("corrects the current value without adding history", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"), "размыто").correct("Поставлю кружку в раковину");
		expect(next.versions).toEqual([
			{ value: "Поставлю кружку в раковину", since: d("2026-09-20") },
			{ value: "Выпью кофе", since: d("2026-09-01"), replacedBecause: "размыто" },
		]);
	});

	it("answers which version was active on a date", () => {
		const next = coffee.replace("Поставлю кружку", d("2026-09-20"));
		expect(next.at(d("2026-08-31"))).toBeUndefined();
		expect(next.at(d("2026-09-01"))).toBe("Выпью кофе");
		expect(next.at(d("2026-09-19"))).toBe("Выпью кофе");
		expect(next.at(d("2026-09-20"))).toBe("Поставлю кружку");
	});

	it("starts empty and gets a first version on replace", () => {
		const empty = Component.empty<string>();
		expect(empty.isEmpty).toBe(true);
		expect(empty.current()).toBeUndefined();
		expect(empty.replace("15 минут", d("2026-10-01")).versions).toEqual([{ value: "15 минут", since: d("2026-10-01") }]);
		expect(() => empty.correct("x")).toThrow(DomainError);
	});

	it("rejects versions that are not strictly newest first", () => {
		expect(() =>
			Component.of([
				{ value: "a", since: d("2026-09-01") },
				{ value: "b", since: d("2026-09-01") },
			]),
		).toThrow("одной датой");
		expect(() =>
			Component.of([
				{ value: "a", since: d("2026-09-01") },
				{ value: "b", since: d("2026-09-20") },
			]),
		).toThrow(DomainError);
	});

	it("uses the provided equality", () => {
		const sets = Component.start([1, 2], d("2026-09-01"), (a, b) => a.join() === b.join());
		expect(sets.replace([1, 2], d("2026-09-20"))).toBe(sets);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/Component.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/Component'`.

- [ ] **Step 3: Реализовать**

`src/domain/Component.ts`:
```ts
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/Component.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/Component.ts tests/Component.test.ts
git commit -m "Add versioned recipe component"
```

---

### Task 3: Schedule и DayMark

**Files:**
- Create: `src/domain/Schedule.ts`, `src/domain/DayMark.ts`
- Test: `tests/Schedule.test.ts`, `tests/DayMark.test.ts`

**Interfaces:**
- Consumes: `LocalDate`, `WEEKDAYS`, `Weekday`, `DomainError`.
- Produces:
```ts
class Schedule {
  constructor(days: Iterable<Weekday>) // throws DomainError if empty
  static everyDay(): Schedule
  get weekdays(): Weekday[]   // mon..sun order
  get isEveryDay(): boolean
  includes(date: LocalDate): boolean
  equals(other: Schedule): boolean
}
type DayMark = { readonly kind: "tiny" } | { readonly kind: "full" } | { readonly kind: "missed"; readonly reason: string }
const TINY: DayMark; const FULL: DayMark
function missed(reason: string): DayMark      // trims, throws DomainError on blank
function isDone(mark?: DayMark): boolean
function nextMark(mark: DayMark | undefined): DayMark | undefined // undefined→tiny→full→undefined; missed throws
```

- [ ] **Step 1: Написать падающие тесты**

`tests/Schedule.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DomainError } from "../src/domain/DomainError";
import { Schedule } from "../src/domain/Schedule";
import { d } from "./support/dates";

describe("Schedule", () => {
	it("includes every day when every weekday is set", () => {
		const schedule = Schedule.everyDay();
		expect(schedule.isEveryDay).toBe(true);
		expect(schedule.includes(d("2026-10-05"))).toBe(true);
		expect(schedule.includes(d("2026-10-11"))).toBe(true);
	});

	it("includes only the chosen weekdays", () => {
		const weekend = new Schedule(["sun", "sat"]);
		expect(weekend.isEveryDay).toBe(false);
		expect(weekend.includes(d("2026-10-10"))).toBe(true);
		expect(weekend.includes(d("2026-10-09"))).toBe(false);
	});

	it("lists weekdays from Monday to Sunday", () => {
		expect(new Schedule(["sun", "mon", "wed"]).weekdays).toEqual(["mon", "wed", "sun"]);
	});

	it("needs at least one day", () => {
		expect(() => new Schedule([])).toThrow(DomainError);
	});

	it("compares by weekdays", () => {
		expect(new Schedule(["sat", "sun"]).equals(new Schedule(["sun", "sat"]))).toBe(true);
		expect(new Schedule(["sat"]).equals(Schedule.everyDay())).toBe(false);
	});
});
```

`tests/DayMark.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FULL, TINY, isDone, missed, nextMark } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";

describe("DayMark", () => {
	it("cycles empty → tiny → full → empty", () => {
		expect(nextMark(undefined)).toEqual(TINY);
		expect(nextMark(TINY)).toEqual(FULL);
		expect(nextMark(FULL)).toBeUndefined();
	});

	it("does not cycle a missed day", () => {
		expect(() => nextMark(missed("проспал"))).toThrow(DomainError);
	});

	it("requires a reason for a missed day", () => {
		expect(missed("  проспал ")).toEqual({ kind: "missed", reason: "проспал" });
		expect(() => missed("   ")).toThrow("причин");
	});

	it("treats tiny and full as done", () => {
		expect(isDone(TINY)).toBe(true);
		expect(isDone(FULL)).toBe(true);
		expect(isDone(missed("x"))).toBe(false);
		expect(isDone(undefined)).toBe(false);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/Schedule.test.ts tests/DayMark.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать**

`src/domain/Schedule.ts`:
```ts
import { DomainError } from "./DomainError";
import { LocalDate, WEEKDAYS, Weekday } from "./LocalDate";

export class Schedule {
	private readonly days: ReadonlySet<Weekday>;

	constructor(days: Iterable<Weekday>) {
		this.days = new Set(days);
		if (this.days.size === 0) throw new DomainError("В расписании нужен хотя бы один день");
	}

	static everyDay(): Schedule {
		return new Schedule(WEEKDAYS);
	}

	get weekdays(): Weekday[] {
		return WEEKDAYS.filter((day) => this.days.has(day));
	}

	get isEveryDay(): boolean {
		return this.days.size === WEEKDAYS.length;
	}

	includes(date: LocalDate): boolean {
		return this.days.has(date.weekday());
	}

	equals(other: Schedule): boolean {
		return this.weekdays.join() === other.weekdays.join();
	}
}
```

`src/domain/DayMark.ts`:
```ts
import { DomainError } from "./DomainError";

export type DayMark =
	| { readonly kind: "tiny" }
	| { readonly kind: "full" }
	| { readonly kind: "missed"; readonly reason: string };

export const TINY: DayMark = { kind: "tiny" };
export const FULL: DayMark = { kind: "full" };

export function missed(reason: string): DayMark {
	const text = reason.trim();
	if (!text) throw new DomainError("Укажи причину, почему не получилось");
	return { kind: "missed", reason: text };
}

export function isDone(mark?: DayMark): boolean {
	return mark?.kind === "tiny" || mark?.kind === "full";
}

export function nextMark(mark: DayMark | undefined): DayMark | undefined {
	if (mark === undefined) return TINY;
	if (mark.kind === "tiny") return FULL;
	if (mark.kind === "full") return undefined;
	throw new DomainError("Пропуск меняется явно, а не тапом");
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/Schedule.test.ts tests/DayMark.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/Schedule.ts src/domain/DayMark.ts tests/Schedule.test.ts tests/DayMark.test.ts
git commit -m "Add weekday schedule and day marks"
```

---

### Task 4: Habit — агрегат привычки

**Files:**
- Create: `src/domain/Habit.ts`
- Test: `tests/Habit.test.ts`

**Interfaces:**
- Consumes: `Component`, `Version`, `Schedule`, `DayMark`, `LocalDate`, `Weekday`, `DomainError`.
- Produces:
```ts
const TEXT_PARTS: readonly ["anchor", "tiny", "full", "celebration"]
type TextPart = "anchor" | "tiny" | "full" | "celebration"
type Part = TextPart | "schedule"
const sameSchedule: (a: Schedule, b: Schedule) => boolean
interface HabitState { name: string; order?: number; archived: boolean; schedule: Component<Schedule>;
  text: Readonly<Record<TextPart, Component<string>>>; marks: ReadonlyMap<string, DayMark> }
interface NewHabit { name: string; anchor: string; tiny: string; full?: string; celebration?: string; days: readonly Weekday[] }
type RecipeChange = { date: LocalDate; because?: string } & (
  { part: TextPart; from?: string; to: string } | { part: "schedule"; from?: Schedule; to: Schedule })
class Habit {
  static restore(state: HabitState): Habit      // validates, throws DomainError
  static create(input: NewHabit, today: LocalDate): Habit
  get name(): string; get order(): number | undefined; get archived(): boolean
  get schedule(): Component<Schedule>; get currentSchedule(): Schedule; get createdOn(): LocalDate
  text(part: TextPart): Component<string>
  isScheduled(date: LocalDate): boolean
  markOn(date: LocalDate): DayMark | undefined
  marks(): Array<[LocalDate, DayMark]>            // newest first
  withMark(date: LocalDate, mark: DayMark | undefined, today: LocalDate): Habit
  replaceText(part: TextPart, value: string, today: LocalDate, because?: string): Habit
  correctText(part: TextPart, value: string): Habit
  replaceSchedule(schedule: Schedule, today: LocalDate, because?: string): Habit
  correctSchedule(schedule: Schedule): Habit
  archive(): Habit
  changes(): RecipeChange[]                       // newest first, creation excluded
}
```

- [ ] **Step 1: Написать падающий тест**

`tests/Habit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FULL, TINY, missed } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";
import { Habit } from "../src/domain/Habit";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { Schedule } from "../src/domain/Schedule";
import { d } from "./support/dates";

const created = d("2026-09-01");
const today = d("2026-10-09");
const base = () =>
	Habit.create({ name: " Зарядка ", anchor: " Выпью кофе ", tiny: "1 приседание", celebration: "", days: WEEKDAYS }, created);

describe("Habit", () => {
	it("is created with trimmed values and optional parts left empty", () => {
		const habit = base();
		expect(habit.name).toBe("Зарядка");
		expect(habit.text("anchor").current()).toBe("Выпью кофе");
		expect(habit.text("full").isEmpty).toBe(true);
		expect(habit.text("celebration").isEmpty).toBe(true);
		expect(habit.currentSchedule.isEveryDay).toBe(true);
		expect(habit.createdOn).toEqual(created);
		expect(habit.archived).toBe(false);
		expect(habit.order).toBeUndefined();
	});

	it("requires a name, an anchor and a tiny behavior", () => {
		const input = { name: "Зарядка", anchor: "Кофе", tiny: "1", days: WEEKDAYS };
		expect(() => Habit.create({ ...input, name: " " }, created)).toThrow(DomainError);
		expect(() => Habit.create({ ...input, name: "a/b" }, created)).toThrow(DomainError);
		expect(() => Habit.create({ ...input, anchor: " " }, created)).toThrow("якорь");
		expect(() => Habit.create({ ...input, tiny: "" }, created)).toThrow("нанодействие");
		expect(() => Habit.create({ ...input, days: [] }, created)).toThrow(DomainError);
	});

	it("sets and clears marks without changing the original", () => {
		const habit = base();
		const marked = habit.withMark(d("2026-10-08"), FULL, today);
		expect(marked.markOn(d("2026-10-08"))).toEqual(FULL);
		expect(habit.markOn(d("2026-10-08"))).toBeUndefined();
		expect(marked.withMark(d("2026-10-08"), undefined, today).markOn(d("2026-10-08"))).toBeUndefined();
	});

	it("refuses to mark a future day", () => {
		expect(() => base().withMark(d("2026-10-10"), TINY, today)).toThrow(DomainError);
	});

	it("lists marks newest first", () => {
		const habit = base()
			.withMark(d("2026-10-01"), TINY, today)
			.withMark(d("2026-10-07"), missed("проспал"), today)
			.withMark(d("2026-10-03"), FULL, today);
		expect(habit.marks().map(([date, mark]) => [date.toString(), mark.kind])).toEqual([
			["2026-10-07", "missed"],
			["2026-10-03", "full"],
			["2026-10-01", "tiny"],
		]);
	});

	it("checks the schedule that was active on each date", () => {
		const habit = base().replaceSchedule(new Schedule(["sat"]), d("2026-10-01"));
		expect(habit.isScheduled(d("2026-08-31"))).toBe(false);
		expect(habit.isScheduled(d("2026-09-30"))).toBe(true);
		expect(habit.isScheduled(d("2026-10-07"))).toBe(false);
		expect(habit.isScheduled(d("2026-10-10"))).toBe(true);
	});

	it("rejects blank replacements", () => {
		expect(() => base().replaceText("anchor", "  ", today)).toThrow(DomainError);
		expect(() => base().correctText("tiny", "")).toThrow(DomainError);
	});

	it("describes recipe changes newest first, without the creation", () => {
		const habit = base()
			.replaceText("anchor", "Поставлю кружку", d("2026-09-20"), "С кофе забывал")
			.replaceText("tiny", "2 приседания", d("2026-09-05"))
			.replaceText("full", "15 минут", d("2026-10-01"))
			.replaceSchedule(new Schedule(["mon", "wed"]), d("2026-10-02"));
		const changes = habit.changes();
		expect(changes.map((change) => [change.date.toString(), change.part])).toEqual([
			["2026-10-02", "schedule"],
			["2026-10-01", "full"],
			["2026-09-20", "anchor"],
			["2026-09-05", "tiny"],
		]);
		expect(changes[1]).toEqual({ part: "full", date: d("2026-10-01"), from: undefined, to: "15 минут", because: undefined });
		expect(changes[2]).toEqual({ part: "anchor", date: d("2026-09-20"), from: "Выпью кофе", to: "Поставлю кружку", because: "С кофе забывал" });
	});

	it("corrects a value without recording a change", () => {
		const habit = base().correctText("anchor", "Выпью утренний кофе");
		expect(habit.text("anchor").current()).toBe("Выпью утренний кофе");
		expect(habit.changes()).toEqual([]);
	});

	it("archives", () => {
		expect(base().archive().archived).toBe(true);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/Habit.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/Habit'`.

- [ ] **Step 3: Реализовать**

`src/domain/Habit.ts`:
```ts
import { Component, Version } from "./Component";
import { DayMark } from "./DayMark";
import { DomainError } from "./DomainError";
import { LocalDate, Weekday } from "./LocalDate";
import { Schedule } from "./Schedule";

export const TEXT_PARTS = ["anchor", "tiny", "full", "celebration"] as const;
export type TextPart = (typeof TEXT_PARTS)[number];
export type Part = TextPart | "schedule";

const REQUIRED_TEXT: ReadonlyArray<[TextPart, string]> = [
	["anchor", "Не заполнен якорь"],
	["tiny", "Не заполнено нанодействие"],
];
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|#^[\]]/;

export const sameSchedule = (a: Schedule, b: Schedule): boolean => a.equals(b);

export interface HabitState {
	readonly name: string;
	readonly order?: number;
	readonly archived: boolean;
	readonly schedule: Component<Schedule>;
	readonly text: Readonly<Record<TextPart, Component<string>>>;
	readonly marks: ReadonlyMap<string, DayMark>;
}

export interface NewHabit {
	readonly name: string;
	readonly anchor: string;
	readonly tiny: string;
	readonly full?: string;
	readonly celebration?: string;
	readonly days: readonly Weekday[];
}

interface ChangeBase {
	readonly date: LocalDate;
	readonly because?: string;
}

export type RecipeChange =
	| (ChangeBase & { readonly part: TextPart; readonly from?: string; readonly to: string })
	| (ChangeBase & { readonly part: "schedule"; readonly from?: Schedule; readonly to: Schedule });

function requireText(value: string): string {
	const text = value.trim();
	if (!text) throw new DomainError("Значение не может быть пустым");
	return text;
}

export class Habit {
	private constructor(private readonly state: HabitState) {}

	static restore(state: HabitState): Habit {
		const name = state.name.trim();
		if (!name) throw new DomainError("У привычки нет названия");
		if (FORBIDDEN_NAME_CHARS.test(name)) throw new DomainError('В названии нельзя использовать \\ / : * ? " < > | # ^ [ ]');
		if (state.schedule.isEmpty) throw new DomainError("Не задано расписание");
		for (const [part, message] of REQUIRED_TEXT) if (state.text[part].isEmpty) throw new DomainError(message);
		for (const [part, component] of Object.entries(state.text)) {
			if (component.versions.some((version) => !version.value.trim())) throw new DomainError(`Пустое значение в ${part}`);
		}
		return new Habit({ ...state, name });
	}

	static create(input: NewHabit, today: LocalDate): Habit {
		const start = (value?: string): Component<string> => {
			const text = value?.trim();
			return text ? Component.start(text, today) : Component.empty<string>();
		};
		return Habit.restore({
			name: input.name,
			archived: false,
			schedule: Component.start(new Schedule(input.days), today, sameSchedule),
			text: {
				anchor: start(input.anchor),
				tiny: start(input.tiny),
				full: start(input.full),
				celebration: start(input.celebration),
			},
			marks: new Map(),
		});
	}

	get name(): string {
		return this.state.name;
	}

	get order(): number | undefined {
		return this.state.order;
	}

	get archived(): boolean {
		return this.state.archived;
	}

	get schedule(): Component<Schedule> {
		return this.state.schedule;
	}

	get currentSchedule(): Schedule {
		return this.state.schedule.versions[0].value;
	}

	get createdOn(): LocalDate {
		const firsts = [this.state.schedule.versions, this.state.text.anchor.versions, this.state.text.tiny.versions].map(
			(versions) => versions[versions.length - 1].since,
		);
		return firsts.reduce((earliest, date) => (date.isBefore(earliest) ? date : earliest));
	}

	text(part: TextPart): Component<string> {
		return this.state.text[part];
	}

	isScheduled(date: LocalDate): boolean {
		return this.state.schedule.at(date)?.includes(date) ?? false;
	}

	markOn(date: LocalDate): DayMark | undefined {
		return this.state.marks.get(date.toString());
	}

	marks(): Array<[LocalDate, DayMark]> {
		return [...this.state.marks]
			.flatMap(([key, mark]): Array<[LocalDate, DayMark]> => {
				const date = LocalDate.parse(key);
				return date ? [[date, mark]] : [];
			})
			.sort(([a], [b]) => b.compare(a));
	}

	withMark(date: LocalDate, mark: DayMark | undefined, today: LocalDate): Habit {
		if (date.isAfter(today)) throw new DomainError("Нельзя отметить будущий день");
		const marks = new Map(this.state.marks);
		if (mark) marks.set(date.toString(), mark);
		else marks.delete(date.toString());
		return new Habit({ ...this.state, marks });
	}

	replaceText(part: TextPart, value: string, today: LocalDate, because?: string): Habit {
		return this.withText(part, this.state.text[part].replace(requireText(value), today, because));
	}

	correctText(part: TextPart, value: string): Habit {
		return this.withText(part, this.state.text[part].correct(requireText(value)));
	}

	replaceSchedule(schedule: Schedule, today: LocalDate, because?: string): Habit {
		return new Habit({ ...this.state, schedule: this.state.schedule.replace(schedule, today, because) });
	}

	correctSchedule(schedule: Schedule): Habit {
		return new Habit({ ...this.state, schedule: this.state.schedule.correct(schedule) });
	}

	archive(): Habit {
		return new Habit({ ...this.state, archived: true });
	}

	changes(): RecipeChange[] {
		const created = this.createdOn;
		const collect = <T>(
			versions: readonly Version<T>[],
			build: (version: Version<T>, previous?: Version<T>) => RecipeChange,
		): RecipeChange[] =>
			versions.flatMap((version, index) => {
				const previous = versions[index + 1];
				if (!previous && version.since.equals(created)) return [];
				return [build(version, previous)];
			});
		const text = TEXT_PARTS.flatMap((part) =>
			collect(this.state.text[part].versions, (version, previous) => ({
				part,
				date: version.since,
				from: previous?.value,
				to: version.value,
				because: previous?.replacedBecause,
			})),
		);
		const schedule = collect(this.state.schedule.versions, (version, previous) => ({
			part: "schedule" as const,
			date: version.since,
			from: previous?.value,
			to: version.value,
			because: previous?.replacedBecause,
		}));
		return [...text, ...schedule].sort((a, b) => b.date.compare(a.date));
	}

	private withText(part: TextPart, component: Component<string>): Habit {
		return new Habit({ ...this.state, text: { ...this.state.text, [part]: component } });
	}
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/Habit.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/Habit.ts tests/Habit.test.ts
git commit -m "Add habit aggregate with recipe history and marks"
```

---

### Task 5: Статистика и правило подсказки

**Files:**
- Create: `src/domain/Stats.ts`, `src/domain/RedesignRule.ts`
- Test: `tests/Stats.test.ts`, `tests/RedesignRule.test.ts`

**Interfaces:**
- Consumes: `Habit`, `isDone`, `LocalDate`.
- Produces:
```ts
const WINDOW_DAYS = 30
interface Breakdown { tiny: number; full: number; missed: number; empty: number }
interface WindowStats { done: number; scheduled: number; percent: number | null; breakdown: Breakdown }
interface Streak { length: number; start: LocalDate; end: LocalDate }
interface HabitStats { window: WindowStats; current?: Streak; best: number; streaks: readonly Streak[]; total: number }
function computeStats(habit: Habit, today: LocalDate): HabitStats
function missesInARow(habit: Habit): number
function needsRedesign(habit: Habit, threshold: number): boolean
```
`streaks` содержит 5 самых длинных серий (при равной длине первой идёт более новая) и в конце текущую, если она не вошла в пятёрку. `current` — тот же объект, что лежит в `streaks`.

- [ ] **Step 1: Написать падающие тесты**

`tests/Stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DayMark, FULL, TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { LocalDate, WEEKDAYS, Weekday } from "../src/domain/LocalDate";
import { Schedule } from "../src/domain/Schedule";
import { computeStats } from "../src/domain/Stats";
import { d } from "./support/dates";

const habit = (created: string, days: readonly Weekday[] = WEEKDAYS) =>
	Habit.create({ name: "Зарядка", anchor: "Кружка", tiny: "2 приседания", days }, d(created));

const withMarks = (start: Habit, today: LocalDate, marks: Record<string, DayMark>) =>
	Object.entries(marks).reduce((current, [date, mark]) => current.withMark(d(date), mark, today), start);

describe("computeStats window", () => {
	const today = d("2026-10-09");

	it("counts scheduled days in the last 30 days and leaves out an unmarked today", () => {
		const stats = computeStats(
			withMarks(habit("2026-09-01"), today, { "2026-10-08": FULL, "2026-10-07": TINY, "2026-10-06": missed("проспал") }),
			today,
		);
		expect(stats.window).toEqual({
			done: 2,
			scheduled: 29,
			percent: 7,
			breakdown: { tiny: 1, full: 1, missed: 1, empty: 26 },
		});
	});

	it("counts today once it is marked", () => {
		const stats = computeStats(withMarks(habit("2026-09-01"), today, { "2026-10-08": FULL, "2026-10-07": TINY, "2026-10-09": TINY }), today);
		expect(stats.window.scheduled).toBe(30);
		expect(stats.window.done).toBe(3);
		expect(stats.window.percent).toBe(10);
	});

	it("ignores days outside the schedule in the window but counts them in the total", () => {
		const stats = computeStats(
			withMarks(habit("2026-09-01", ["sat"]), today, {
				"2026-10-03": TINY,
				"2026-09-26": missed("уехал"),
				"2026-10-05": FULL,
			}),
			today,
		);
		expect(stats.window).toEqual({ done: 1, scheduled: 4, percent: 25, breakdown: { tiny: 1, full: 0, missed: 1, empty: 2 } });
		expect(stats.total).toBe(2);
	});

	it("does not count days before the habit existed", () => {
		const stats = computeStats(habit("2026-10-05"), today);
		expect(stats.window).toEqual({ done: 0, scheduled: 4, percent: 0, breakdown: { tiny: 0, full: 0, missed: 0, empty: 4 } });
	});

	it("uses the schedule that was active on each past day", () => {
		const changed = habit("2026-09-01").replaceSchedule(new Schedule(["sat"]), d("2026-10-01"));
		expect(computeStats(changed, today).window.scheduled).toBe(22);
	});

	it("has no percent when nothing was scheduled", () => {
		expect(computeStats(habit("2026-10-09"), today).window.percent).toBeNull();
	});
});

describe("computeStats streaks", () => {
	it("finds streaks, keeps the current one alive through an unmarked today", () => {
		const today = d("2026-09-09");
		const stats = computeStats(
			withMarks(habit("2026-09-01"), today, {
				"2026-09-01": TINY,
				"2026-09-02": TINY,
				"2026-09-03": TINY,
				"2026-09-05": FULL,
				"2026-09-06": FULL,
				"2026-09-07": missed("болел"),
				"2026-09-08": TINY,
			}),
			today,
		);
		expect(stats.best).toBe(3);
		expect(stats.current).toEqual({ length: 1, start: d("2026-09-08"), end: d("2026-09-08") });
		expect(stats.streaks.map((streak) => streak.length)).toEqual([3, 2, 1]);
	});

	it("loses the current streak after an empty scheduled day before today", () => {
		const today = d("2026-09-10");
		const stats = computeStats(withMarks(habit("2026-09-01"), today, { "2026-09-08": TINY }), today);
		expect(stats.current).toBeUndefined();
		expect(stats.best).toBe(1);
	});

	it("skips days outside the schedule without breaking or extending a streak", () => {
		const today = d("2026-10-09");
		const weekend = withMarks(habit("2026-09-01", ["sat", "sun"]), today, { "2026-10-03": TINY, "2026-10-04": FULL });
		expect(computeStats(weekend, today).current?.length).toBe(2);
		const withMonday = weekend.withMark(d("2026-10-05"), FULL, today);
		expect(computeStats(withMonday, today).current?.length).toBe(2);
		expect(computeStats(withMonday, today).total).toBe(3);
	});

	it("shows the five longest streaks plus the current one", () => {
		const today = d("2026-09-26");
		let current = habit("2026-09-01");
		let date = d("2026-09-01");
		for (const length of [2, 3, 4, 5, 6]) {
			for (let day = 0; day < length; day++) {
				current = current.withMark(date, TINY, today);
				date = date.addDays(1);
			}
			current = current.withMark(date, missed("x"), today);
			date = date.addDays(1);
		}
		current = current.withMark(date, TINY, today);
		const stats = computeStats(current, today);
		expect(stats.streaks.map((streak) => streak.length)).toEqual([6, 5, 4, 3, 2, 1]);
		expect(stats.streaks[5]).toBe(stats.current);
	});
});
```

`tests/RedesignRule.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TINY, missed } from "../src/domain/DayMark";
import { Habit } from "../src/domain/Habit";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { missesInARow, needsRedesign } from "../src/domain/RedesignRule";
import { d } from "./support/dates";

const today = d("2026-10-09");
const base = Habit.create({ name: "Зарядка", anchor: "Кружка", tiny: "2", days: WEEKDAYS }, d("2026-09-01"));

describe("RedesignRule", () => {
	const struggling = base
		.withMark(d("2026-10-01"), TINY, today)
		.withMark(d("2026-10-03"), missed("проспал"), today)
		.withMark(d("2026-10-05"), missed("уехал"), today)
		.withMark(d("2026-10-06"), missed("проспал"), today);

	it("counts misses after the last done day and ignores empty days", () => {
		expect(missesInARow(struggling)).toBe(3);
		expect(needsRedesign(struggling, 3)).toBe(true);
		expect(needsRedesign(struggling, 4)).toBe(false);
	});

	it("resets after a done day", () => {
		expect(missesInARow(struggling.withMark(d("2026-10-07"), TINY, today))).toBe(0);
	});

	it("counts from the start when nothing was done yet", () => {
		const neverDone = base.withMark(d("2026-10-01"), missed("a"), today).withMark(d("2026-10-02"), missed("b"), today);
		expect(missesInARow(neverDone)).toBe(2);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/Stats.test.ts tests/RedesignRule.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать**

`src/domain/Stats.ts`:
```ts
import { isDone } from "./DayMark";
import { Habit } from "./Habit";
import { LocalDate } from "./LocalDate";

export const WINDOW_DAYS = 30;
const SHOWN_STREAKS = 5;

export interface Breakdown {
	tiny: number;
	full: number;
	missed: number;
	empty: number;
}

export interface WindowStats {
	readonly done: number;
	readonly scheduled: number;
	readonly percent: number | null;
	readonly breakdown: Breakdown;
}

export interface Streak {
	readonly length: number;
	readonly start: LocalDate;
	readonly end: LocalDate;
}

export interface HabitStats {
	readonly window: WindowStats;
	readonly current?: Streak;
	readonly best: number;
	readonly streaks: readonly Streak[];
	readonly total: number;
}

export function computeStats(habit: Habit, today: LocalDate): HabitStats {
	const { all, current } = collectStreaks(habit, today);
	const byLength = [...all].sort((a, b) => b.length - a.length || b.end.compare(a.end));
	const streaks = byLength.slice(0, SHOWN_STREAKS);
	if (current && !streaks.includes(current)) streaks.push(current);
	return {
		window: windowStats(habit, today),
		current,
		best: byLength[0]?.length ?? 0,
		streaks,
		total: habit.marks().filter(([, mark]) => isDone(mark)).length,
	};
}

function windowStats(habit: Habit, today: LocalDate): WindowStats {
	const breakdown: Breakdown = { tiny: 0, full: 0, missed: 0, empty: 0 };
	for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
		const date = today.addDays(-offset);
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (mark) breakdown[mark.kind]++;
		else if (!date.equals(today)) breakdown.empty++;
	}
	const done = breakdown.tiny + breakdown.full;
	const scheduled = done + breakdown.missed + breakdown.empty;
	return { done, scheduled, percent: scheduled ? Math.round((done * 100) / scheduled) : null, breakdown };
}

function collectStreaks(habit: Habit, today: LocalDate): { all: Streak[]; current?: Streak } {
	const all: Streak[] = [];
	let run: Streak | undefined;
	for (let date = habit.createdOn; !date.isAfter(today); date = date.addDays(1)) {
		if (!habit.isScheduled(date)) continue;
		const mark = habit.markOn(date);
		if (isDone(mark)) {
			run = run ? { ...run, length: run.length + 1, end: date } : { length: 1, start: date, end: date };
			continue;
		}
		if (!mark && date.equals(today)) continue;
		if (run) all.push(run);
		run = undefined;
	}
	if (run) all.push(run);
	return { all, current: run };
}
```

`src/domain/RedesignRule.ts`:
```ts
import { isDone } from "./DayMark";
import { Habit } from "./Habit";

export function missesInARow(habit: Habit): number {
	let count = 0;
	for (const [, mark] of habit.marks()) {
		if (isDone(mark)) break;
		count++;
	}
	return count;
}

export function needsRedesign(habit: Habit, threshold: number): boolean {
	return missesInARow(habit) >= threshold;
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/Stats.test.ts tests/RedesignRule.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/Stats.ts src/domain/RedesignRule.ts tests/Stats.test.ts tests/RedesignRule.test.ts
git commit -m "Add habit statistics and redesign rule"
```

---

### Task 6: HabitCodec — frontmatter ↔ Habit

**Files:**
- Create: `src/infrastructure/HabitCodec.ts`
- Create: `tests/support/habits.ts`
- Test: `tests/HabitCodec.test.ts`

**Interfaces:**
- Consumes: `Habit`, `TEXT_PARTS`, `TextPart`, `sameSchedule`, `Component`, `Version`, `Schedule`, `TINY`, `FULL`, `missed`, `DayMark`, `LocalDate`, `WEEKDAYS`, `Weekday`, `DomainError`.
- Produces:
```ts
type Frontmatter = Record<string, unknown>
class HabitDecodeError extends Error {}
function decodeHabit(name: string, frontmatter: Frontmatter | null | undefined): Habit  // throws HabitDecodeError
function encodeHabit(habit: Habit, frontmatter: Frontmatter): void                    // mutates only own keys
```
Тестовый хелпер `habitNote(name: string, extra?: Frontmatter): Habit` собирает привычку через `decodeHabit`. Он нужен тестам UI-хелперов в Task 8.

- [ ] **Step 1: Написать падающий тест**

`tests/HabitCodec.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FULL, missed } from "../src/domain/DayMark";
import { Frontmatter, HabitDecodeError, decodeHabit, encodeHabit } from "../src/infrastructure/HabitCodec";
import { d } from "./support/dates";

const EXAMPLE: Frontmatter = {
	order: 1,
	schedule: [{ value: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], since: "2026-09-01" }],
	anchor: [
		{ value: "Поставлю кружку в раковину", since: "2026-09-20" },
		{ value: "Выпью кофе", since: "2026-09-01", replaced_because: "С кофе забывал — якорь размытый" },
	],
	tiny: [
		{ value: "2 приседания", since: "2026-09-05" },
		{ value: "1 приседание", since: "2026-09-01" },
	],
	full: [{ value: "15 минут зарядки", since: "2026-09-01" }],
	celebration: [{ value: "«Есть!» + кулак", since: "2026-09-01" }],
	done_tiny: ["2026-10-08", "2026-10-06"],
	done_full: ["2026-10-09"],
	missed: [{ date: "2026-10-07", reason: "Пил кофе не дома" }],
};

const example = (patch: Frontmatter = {}): Frontmatter => ({ ...structuredClone(EXAMPLE), ...patch });

describe("decodeHabit", () => {
	it("reads the spec example", () => {
		const habit = decodeHabit("Зарядка", example());
		expect(habit.name).toBe("Зарядка");
		expect(habit.order).toBe(1);
		expect(habit.archived).toBe(false);
		expect(habit.text("anchor").current()).toBe("Поставлю кружку в раковину");
		expect(habit.text("anchor").versions[1].replacedBecause).toBe("С кофе забывал — якорь размытый");
		expect(habit.currentSchedule.isEveryDay).toBe(true);
		expect(habit.markOn(d("2026-10-09"))).toEqual(FULL);
		expect(habit.markOn(d("2026-10-07"))).toEqual(missed("Пил кофе не дома"));
	});

	it("accepts unsorted lists and Date values", () => {
		const habit = decodeHabit(
			"Зарядка",
			example({
				done_tiny: ["2026-10-06", new Date("2026-10-08")],
				tiny: [
					{ value: "1 приседание", since: "2026-09-01" },
					{ value: "2 приседания", since: "2026-09-05" },
				],
			}),
		);
		const frontmatter: Frontmatter = {};
		encodeHabit(habit, frontmatter);
		expect(frontmatter).toEqual(EXAMPLE);
	});

	it("reads archived", () => {
		expect(decodeHabit("Зарядка", example({ archived: true })).archived).toBe(true);
	});

	it.each([
		["no properties", undefined, "свойств"],
		["no anchor", { anchor: undefined }, "якорь"],
		["anchor not a list", { anchor: "Кружка" }, "anchor"],
		["bad date", { done_tiny: ["2026-13-01"] }, "done_tiny"],
		["two marks on one day", { done_full: ["2026-10-08"] }, "2026-10-08"],
		["missed without reason", { missed: [{ date: "2026-10-07" }] }, "причин"],
		["unknown weekday", { schedule: [{ value: ["funday"], since: "2026-09-01" }] }, "funday"],
		["empty schedule", { schedule: [{ value: [], since: "2026-09-01" }] }, "день"],
		[
			"two versions on one day",
			{
				tiny: [
					{ value: "a", since: "2026-09-01" },
					{ value: "b", since: "2026-09-01" },
				],
			},
			"одной датой",
		],
		["order not a number", { order: "first" }, "order"],
	])("reports %s", (_label, patch, message) => {
		const frontmatter = patch === undefined ? undefined : example(patch as Frontmatter);
		expect(() => decodeHabit("Зарядка", frontmatter)).toThrow(HabitDecodeError);
		expect(() => decodeHabit("Зарядка", frontmatter)).toThrow(message);
	});
});

describe("encodeHabit", () => {
	it("round-trips the spec example", () => {
		const frontmatter: Frontmatter = {};
		encodeHabit(decodeHabit("Зарядка", example()), frontmatter);
		expect(frontmatter).toEqual(EXAMPLE);
	});

	it("keeps unknown keys and drops archived=false", () => {
		const frontmatter: Frontmatter = { tags: ["habit"], ...example(), archived: false };
		encodeHabit(decodeHabit("Зарядка", example()), frontmatter);
		expect(frontmatter).toEqual({ tags: ["habit"], ...EXAMPLE });
	});

	it("removes lists that became empty", () => {
		const habit = decodeHabit("Зарядка", example({ done_tiny: undefined, done_full: undefined, missed: undefined, full: undefined, order: undefined }));
		const frontmatter: Frontmatter = example();
		encodeHabit(habit, frontmatter);
		for (const key of ["done_tiny", "done_full", "missed", "full", "order"]) expect(frontmatter).not.toHaveProperty(key);
	});

	it("writes archived=true", () => {
		const frontmatter: Frontmatter = {};
		encodeHabit(decodeHabit("Зарядка", example()).archive(), frontmatter);
		expect(frontmatter.archived).toBe(true);
	});
});
```

`tests/support/habits.ts`:
```ts
import { Habit } from "../../src/domain/Habit";
import { Frontmatter, decodeHabit } from "../../src/infrastructure/HabitCodec";

export function habitNote(name: string, extra: Frontmatter = {}): Habit {
	return decodeHabit(name, {
		schedule: [{ value: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], since: "2026-10-01" }],
		anchor: [{ value: "Поставлю кружку в раковину", since: "2026-10-01" }],
		tiny: [{ value: "2 приседания", since: "2026-10-01" }],
		...extra,
	});
}
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/HabitCodec.test.ts`
Expected: FAIL — `Cannot find module '../src/infrastructure/HabitCodec'`.

- [ ] **Step 3: Реализовать**

`src/infrastructure/HabitCodec.ts`:
```ts
import { Component, Version } from "../domain/Component";
import { DayMark, FULL, TINY, missed } from "../domain/DayMark";
import { DomainError } from "../domain/DomainError";
import { Habit, TEXT_PARTS, TextPart, sameSchedule } from "../domain/Habit";
import { LocalDate, WEEKDAYS, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";

export type Frontmatter = Record<string, unknown>;

export class HabitDecodeError extends Error {}

const DONE_TINY = "done_tiny";
const DONE_FULL = "done_full";
const MISSED = "missed";

export function decodeHabit(name: string, frontmatter: Frontmatter | null | undefined): Habit {
	if (!frontmatter) throw new HabitDecodeError("нет свойств привычки");
	try {
		const text = Object.fromEntries(TEXT_PARTS.map((part) => [part, readVersions(frontmatter, part, readText)])) as Record<
			TextPart,
			Component<string>
		>;
		return Habit.restore({
			name,
			order: readOrder(frontmatter.order),
			archived: frontmatter.archived === true,
			schedule: readVersions(frontmatter, "schedule", readSchedule, sameSchedule),
			text,
			marks: readMarks(frontmatter),
		});
	} catch (error) {
		if (error instanceof DomainError) throw new HabitDecodeError(error.message);
		throw error;
	}
}

export function encodeHabit(habit: Habit, frontmatter: Frontmatter): void {
	put(frontmatter, "order", habit.order);
	frontmatter.schedule = encodeVersions(habit.schedule.versions, (schedule) => schedule.weekdays);
	for (const part of TEXT_PARTS) put(frontmatter, part, nonEmpty(encodeVersions(habit.text(part).versions, (value) => value)));
	const marks = habit.marks();
	const datesOf = (kind: "tiny" | "full") => marks.filter(([, mark]) => mark.kind === kind).map(([date]) => date.toString());
	put(frontmatter, DONE_TINY, nonEmpty(datesOf("tiny")));
	put(frontmatter, DONE_FULL, nonEmpty(datesOf("full")));
	put(
		frontmatter,
		MISSED,
		nonEmpty(marks.flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date: date.toString(), reason: mark.reason }] : []))),
	);
	put(frontmatter, "archived", habit.archived ? true : undefined);
}

function put(frontmatter: Frontmatter, key: string, value: unknown): void {
	if (value === undefined) delete frontmatter[key];
	else frontmatter[key] = value;
}

function nonEmpty<T>(items: T[]): T[] | undefined {
	return items.length ? items : undefined;
}

function encodeVersions<T>(versions: readonly Version<T>[], encode: (value: T) => unknown): Frontmatter[] {
	return versions.map((version) => ({
		value: encode(version.value),
		since: version.since.toString(),
		...(version.replacedBecause ? { replaced_because: version.replacedBecause } : {}),
	}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function list(frontmatter: Frontmatter, key: string): unknown[] {
	const value = frontmatter[key];
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new HabitDecodeError(`${key}: ожидается список`);
	return value;
}

function readOrder(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new HabitDecodeError(`order: ожидается число, а не «${String(value)}»`);
}

function readDate(value: unknown, where: string): LocalDate {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return LocalDate.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
	}
	const date = typeof value === "string" ? LocalDate.parse(value.trim()) : null;
	if (!date) throw new HabitDecodeError(`${where}: некорректная дата «${String(value)}»`);
	return date;
}

function readText(value: unknown, where: string): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	throw new HabitDecodeError(`${where}: ожидается текст`);
}

function readSchedule(value: unknown, where: string): Schedule {
	if (!Array.isArray(value)) throw new HabitDecodeError(`${where}: ожидается список дней`);
	const days = value.map((day) => {
		if (!WEEKDAYS.includes(day as Weekday)) throw new HabitDecodeError(`${where}: неизвестный день «${String(day)}»`);
		return day as Weekday;
	});
	return new Schedule(days);
}

function readVersions<T>(
	frontmatter: Frontmatter,
	key: string,
	readValue: (value: unknown, where: string) => T,
	same?: (a: T, b: T) => boolean,
): Component<T> {
	const versions = list(frontmatter, key).map((item): Version<T> => {
		if (!isRecord(item)) throw new HabitDecodeError(`${key}: ожидаются записи с value и since`);
		const because = item.replaced_because;
		return {
			value: readValue(item.value, key),
			since: readDate(item.since, key),
			...(typeof because === "string" && because.trim() ? { replacedBecause: because.trim() } : {}),
		};
	});
	versions.sort((a, b) => b.since.compare(a.since));
	return Component.of(versions, same);
}

function readMarks(frontmatter: Frontmatter): Map<string, DayMark> {
	const marks = new Map<string, DayMark>();
	const add = (date: LocalDate, mark: DayMark, key: string) => {
		const id = date.toString();
		if (marks.has(id)) throw new HabitDecodeError(`${key}: у дня ${id} уже есть другая отметка`);
		marks.set(id, mark);
	};
	for (const value of list(frontmatter, DONE_TINY)) add(readDate(value, DONE_TINY), TINY, DONE_TINY);
	for (const value of list(frontmatter, DONE_FULL)) add(readDate(value, DONE_FULL), FULL, DONE_FULL);
	for (const item of list(frontmatter, MISSED)) {
		if (!isRecord(item)) throw new HabitDecodeError(`${MISSED}: ожидаются записи с date и reason`);
		add(readDate(item.date, MISSED), missed(typeof item.reason === "string" ? item.reason : ""), MISSED);
	}
	return marks;
}
```

Примечание к `Component.of(versions, same)`: если `same` равен `undefined`, срабатывает параметр по умолчанию `Object.is`.

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/HabitCodec.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/HabitCodec.ts tests/HabitCodec.test.ts tests/support/habits.ts
git commit -m "Add frontmatter codec for habit notes"
```

---

### Task 7: Порт репозитория и HabitService

**Files:**
- Create: `src/application/ports.ts`, `src/application/HabitService.ts`
- Create: `tests/support/InMemoryHabitRepository.ts`
- Test: `tests/HabitService.test.ts`

**Interfaces:**
- Consumes: `Habit`, `NewHabit`, `TextPart`, `Schedule`, `DayMark`, `nextMark`, `Clock`, `LocalDate`, `Weekday`, `DomainError`.
- Produces:
```ts
type HabitEntry =
  | { readonly kind: "ok"; readonly path: string; readonly habit: Habit }
  | { readonly kind: "broken"; readonly path: string; readonly name: string; readonly problem: string }
interface HabitRepository {
  list(): HabitEntry[]
  get(path: string): HabitEntry | undefined
  save(path: string, habit: Habit): Promise<void>
  create(habit: Habit): Promise<string>
}
class HabitService {
  constructor(repository: HabitRepository, clock: Clock)
  today(): LocalDate
  cycle(path: string, date: LocalDate): Promise<Habit>
  setMark(path: string, date: LocalDate, mark: DayMark | undefined): Promise<Habit>
  replaceText(path: string, part: TextPart, value: string, because?: string): Promise<Habit>
  correctText(path: string, part: TextPart, value: string): Promise<Habit>
  replaceSchedule(path: string, days: readonly Weekday[], because?: string): Promise<Habit>
  correctSchedule(path: string, days: readonly Weekday[]): Promise<Habit>
  archive(path: string): Promise<Habit>
  create(input: NewHabit): Promise<string>
}
```

- [ ] **Step 1: Написать падающий тест**

`tests/support/InMemoryHabitRepository.ts`:
```ts
import { HabitEntry, HabitRepository } from "../../src/application/ports";
import { DomainError } from "../../src/domain/DomainError";
import { Habit } from "../../src/domain/Habit";

export class InMemoryHabitRepository implements HabitRepository {
	readonly entries = new Map<string, HabitEntry>();

	list(): HabitEntry[] {
		return [...this.entries.values()];
	}

	get(path: string): HabitEntry | undefined {
		return this.entries.get(path);
	}

	async save(path: string, habit: Habit): Promise<void> {
		if (!this.entries.has(path)) throw new Error(`No habit at ${path}`);
		this.entries.set(path, { kind: "ok", path, habit });
	}

	async create(habit: Habit): Promise<string> {
		const path = `Habits/${habit.name}.md`;
		if (this.entries.has(path)) throw new DomainError(`Привычка «${habit.name}» уже есть`);
		this.entries.set(path, { kind: "ok", path, habit });
		return path;
	}

	habit(path: string): Habit {
		const entry = this.entries.get(path);
		if (entry?.kind !== "ok") throw new Error(`No readable habit at ${path}`);
		return entry.habit;
	}
}
```

`tests/HabitService.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { HabitService } from "../src/application/HabitService";
import { FULL, TINY, missed } from "../src/domain/DayMark";
import { DomainError } from "../src/domain/DomainError";
import { WEEKDAYS } from "../src/domain/LocalDate";
import { InMemoryHabitRepository } from "./support/InMemoryHabitRepository";
import { d } from "./support/dates";

const today = d("2026-10-09");

describe("HabitService", () => {
	let repository: InMemoryHabitRepository;
	let service: HabitService;
	let path: string;

	beforeEach(async () => {
		repository = new InMemoryHabitRepository();
		service = new HabitService(repository, { today: () => today });
		path = await service.create({ name: "Зарядка", anchor: "Кружка", tiny: "2 приседания", days: WEEKDAYS });
	});

	it("creates habits starting today", () => {
		expect(path).toBe("Habits/Зарядка.md");
		expect(repository.habit(path).createdOn).toEqual(today);
	});

	it("rejects a duplicate name", async () => {
		await expect(service.create({ name: "Зарядка", anchor: "a", tiny: "b", days: WEEKDAYS })).rejects.toThrow(DomainError);
	});

	it("cycles a day and stores the result", async () => {
		expect((await service.cycle(path, today)).markOn(today)).toEqual(TINY);
		expect((await service.cycle(path, today)).markOn(today)).toEqual(FULL);
		expect((await service.cycle(path, today)).markOn(today)).toBeUndefined();
		expect(repository.habit(path).markOn(today)).toBeUndefined();
	});

	it("does not cycle a missed day", async () => {
		await service.setMark(path, today, missed("проспал"));
		await expect(service.cycle(path, today)).rejects.toThrow(DomainError);
	});

	it("sets and clears an explicit mark", async () => {
		await service.setMark(path, d("2026-10-08"), missed("уехал"));
		expect(repository.habit(path).markOn(d("2026-10-08"))).toEqual(missed("уехал"));
		await service.setMark(path, d("2026-10-08"), undefined);
		expect(repository.habit(path).markOn(d("2026-10-08"))).toBeUndefined();
	});

	it("changes recipe parts as of today", async () => {
		service = new HabitService(repository, { today: () => d("2026-10-20") });
		await service.replaceText(path, "anchor", "Поставлю кружку", "размыто");
		await service.replaceSchedule(path, ["sat", "sun"]);
		const habit = repository.habit(path);
		expect(habit.text("anchor").versions[0].since).toEqual(d("2026-10-20"));
		expect(habit.text("anchor").versions[1].replacedBecause).toBe("размыто");
		expect(habit.currentSchedule.weekdays).toEqual(["sat", "sun"]);
		await service.correctText(path, "anchor", "Поставлю кружку в раковину");
		await service.correctSchedule(path, ["sun"]);
		expect(repository.habit(path).text("anchor").versions).toHaveLength(2);
		expect(repository.habit(path).currentSchedule.weekdays).toEqual(["sun"]);
	});

	it("archives", async () => {
		await service.archive(path);
		expect(repository.habit(path).archived).toBe(true);
	});

	it("refuses to change an unknown or broken habit", async () => {
		await expect(service.cycle("Habits/Нет.md", today)).rejects.toThrow("не найдена");
		repository.entries.set("Habits/Битая.md", { kind: "broken", path: "Habits/Битая.md", name: "Битая", problem: "нет свойств" });
		await expect(service.cycle("Habits/Битая.md", today)).rejects.toThrow("нет свойств");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/HabitService.test.ts`
Expected: FAIL — `Cannot find module '../src/application/HabitService'`.

- [ ] **Step 3: Реализовать**

`src/application/ports.ts`:
```ts
import { Habit } from "../domain/Habit";

export type HabitEntry =
	| { readonly kind: "ok"; readonly path: string; readonly habit: Habit }
	| { readonly kind: "broken"; readonly path: string; readonly name: string; readonly problem: string };

export interface HabitRepository {
	list(): HabitEntry[];
	get(path: string): HabitEntry | undefined;
	save(path: string, habit: Habit): Promise<void>;
	create(habit: Habit): Promise<string>;
}
```

`src/application/HabitService.ts`:
```ts
import { Clock } from "../domain/Clock";
import { DayMark, nextMark } from "../domain/DayMark";
import { DomainError } from "../domain/DomainError";
import { Habit, NewHabit, TextPart } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { HabitRepository } from "./ports";

export class HabitService {
	constructor(
		private readonly repository: HabitRepository,
		private readonly clock: Clock,
	) {}

	today(): LocalDate {
		return this.clock.today();
	}

	async cycle(path: string, date: LocalDate): Promise<Habit> {
		const habit = this.load(path);
		return this.store(path, habit.withMark(date, nextMark(habit.markOn(date)), this.today()));
	}

	async setMark(path: string, date: LocalDate, mark: DayMark | undefined): Promise<Habit> {
		return this.store(path, this.load(path).withMark(date, mark, this.today()));
	}

	async replaceText(path: string, part: TextPart, value: string, because?: string): Promise<Habit> {
		return this.store(path, this.load(path).replaceText(part, value, this.today(), because));
	}

	async correctText(path: string, part: TextPart, value: string): Promise<Habit> {
		return this.store(path, this.load(path).correctText(part, value));
	}

	async replaceSchedule(path: string, days: readonly Weekday[], because?: string): Promise<Habit> {
		return this.store(path, this.load(path).replaceSchedule(new Schedule(days), this.today(), because));
	}

	async correctSchedule(path: string, days: readonly Weekday[]): Promise<Habit> {
		return this.store(path, this.load(path).correctSchedule(new Schedule(days)));
	}

	async archive(path: string): Promise<Habit> {
		return this.store(path, this.load(path).archive());
	}

	async create(input: NewHabit): Promise<string> {
		return this.repository.create(Habit.create(input, this.today()));
	}

	private load(path: string): Habit {
		const entry = this.repository.get(path);
		if (!entry) throw new DomainError("Привычка не найдена");
		if (entry.kind === "broken") throw new DomainError(`Привычка не читается: ${entry.problem}`);
		return entry.habit;
	}

	private async store(path: string, habit: Habit): Promise<Habit> {
		await this.repository.save(path, habit);
		return habit;
	}
}
```

- [ ] **Step 4: Запустить все тесты**

Run: `npm test`
Expected: PASS (все тесты Task 1–7).

- [ ] **Step 5: Commit**

```bash
git add src/application tests/support/InMemoryHabitRepository.ts tests/HabitService.test.ts
git commit -m "Add habit service on top of a repository port"
```

---

### Task 8: Настройки и чистые UI-хелперы

**Files:**
- Create: `src/settings.ts`, `src/ui/format.ts`, `src/ui/order.ts`, `src/ui/chain.ts`, `src/ui/calendar.ts`
- Test: `tests/Settings.test.ts`, `tests/format.test.ts`, `tests/order.test.ts`, `tests/chain.test.ts`, `tests/calendar.test.ts`

**Interfaces:**
- Consumes: домен, `HabitEntry`, тестовые `habitNote`, `d`.
- Produces:
```ts
// settings.ts
interface HabitSettings { folder: string; redesignThreshold: number; confetti: boolean }
const DEFAULT_SETTINGS: HabitSettings  // { folder: "Habits", redesignThreshold: 3, confetti: true }
function loadSettings(data: unknown): HabitSettings
// ui/format.ts
const PART_LABELS: Record<Part, string>
const LEVEL_LABELS: { tiny: "нано"; full: "полное" }
const BREAKDOWN_LABELS: Record<keyof Breakdown, string>
function weekdayShort(day: Weekday): string
function scheduleLabel(schedule: Schedule): string
function dayMonth(date: LocalDate): string        // "9 окт"
function longDate(date: LocalDate): string        // "пт, 9 октября"
function recipeLine(habit: Habit): string         // "нано: … · полное: …"
function celebrationText(habit: Habit, kind: "tiny" | "full"): { title: string; subtitle: string }
function describeChange(change: RecipeChange): string
// ui/order.ts
function visibleEntries(entries: readonly HabitEntry[]): HabitEntry[]
// ui/chain.ts
interface CellLook { mark?: DayMark; scheduled: boolean; joinLeft: boolean; joinRight: boolean }
function cellLook(habit: Habit, date: LocalDate): CellLook
// ui/calendar.ts
function calendarStart(habit: Habit, today: LocalDate): LocalDate
function calendarWeeks(from: LocalDate, today: LocalDate): Array<Array<LocalDate | undefined>>
```

- [ ] **Step 1: Написать падающие тесты**

`tests/Settings.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
	it("uses defaults for missing data", () => {
		expect(loadSettings(null)).toEqual({ folder: "Habits", redesignThreshold: 3, confetti: true });
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps valid values", () => {
		expect(loadSettings({ folder: " Привычки ", redesignThreshold: 5, confetti: false })).toEqual({
			folder: "Привычки",
			redesignThreshold: 5,
			confetti: false,
		});
	});

	it("replaces invalid values with defaults", () => {
		expect(loadSettings({ folder: "  ", redesignThreshold: 0, confetti: "yes" })).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings({ redesignThreshold: 2.5 }).redesignThreshold).toBe(3);
	});
});
```

`tests/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Schedule } from "../src/domain/Schedule";
import { celebrationText, dayMonth, describeChange, longDate, recipeLine, scheduleLabel } from "../src/ui/format";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("format", () => {
	it("labels schedules", () => {
		expect(scheduleLabel(Schedule.everyDay())).toBe("каждый день");
		expect(scheduleLabel(new Schedule(["fri", "mon", "wed"]))).toBe("пн, ср, пт");
	});

	it("formats dates in Russian", () => {
		expect(dayMonth(d("2026-10-09"))).toBe("9 окт");
		expect(longDate(d("2026-10-09"))).toBe("пт, 9 октября");
		expect(longDate(d("2026-05-01"))).toBe("пт, 1 мая");
	});

	it("shows the recipe line", () => {
		expect(recipeLine(habitNote("Зарядка"))).toBe("нано: 2 приседания");
		expect(recipeLine(habitNote("Зарядка", { full: [{ value: "15 минут", since: "2026-10-01" }] }))).toBe(
			"нано: 2 приседания · полное: 15 минут",
		);
	});

	it("builds the celebration text", () => {
		expect(celebrationText(habitNote("Зарядка", { celebration: [{ value: "Есть!", since: "2026-10-01" }] }), "full")).toEqual({
			title: "Есть!",
			subtitle: "Зарядка · полное",
		});
		expect(celebrationText(habitNote("Зарядка"), "tiny")).toEqual({ title: "Зарядка", subtitle: "нано" });
	});

	it("describes recipe changes", () => {
		expect(describeChange({ part: "anchor", date: d("2026-10-01"), from: "Кофе", to: "Кружка" })).toBe("якорь: Кофе → Кружка");
		expect(describeChange({ part: "full", date: d("2026-10-01"), to: "15 минут" })).toBe("полное: 15 минут");
		expect(describeChange({ part: "schedule", date: d("2026-10-01"), from: Schedule.everyDay(), to: new Schedule(["sat"]) })).toBe(
			"расписание: каждый день → сб",
		);
	});
});
```

`tests/order.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { HabitEntry } from "../src/application/ports";
import { visibleEntries } from "../src/ui/order";
import { habitNote } from "./support/habits";

const ok = (name: string, extra = {}): HabitEntry => ({ kind: "ok", path: `Habits/${name}.md`, habit: habitNote(name, extra) });

describe("visibleEntries", () => {
	it("sorts by order, then by name, and hides archived habits", () => {
		const entries: HabitEntry[] = [
			ok("Второй", { order: 2 }),
			ok("Б"),
			ok("Первый", { order: 1 }),
			{ kind: "broken", path: "Habits/А.md", name: "А", problem: "нет свойств" },
			ok("Архив", { order: 0, archived: true }),
		];
		expect(visibleEntries(entries).map((entry) => (entry.kind === "ok" ? entry.habit.name : entry.name))).toEqual([
			"Первый",
			"Второй",
			"А",
			"Б",
		]);
	});
});
```

`tests/chain.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cellLook } from "../src/ui/chain";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("cellLook", () => {
	const habit = habitNote("Зарядка", { done_tiny: ["2026-10-08", "2026-10-05"], done_full: ["2026-10-06"] });

	it("joins neighbouring done days", () => {
		expect(cellLook(habit, d("2026-10-05"))).toMatchObject({ joinLeft: false, joinRight: true });
		expect(cellLook(habit, d("2026-10-06"))).toMatchObject({ joinLeft: true, joinRight: false });
		expect(cellLook(habit, d("2026-10-08"))).toMatchObject({ joinLeft: false, joinRight: false });
	});

	it("reports empty and unscheduled days", () => {
		expect(cellLook(habit, d("2026-10-07"))).toEqual({ mark: undefined, scheduled: true, joinLeft: false, joinRight: false });
		const weekend = habitNote("Фото", { schedule: [{ value: ["sat"], since: "2026-10-01" }] });
		expect(cellLook(weekend, d("2026-10-09")).scheduled).toBe(false);
		expect(cellLook(weekend, d("2026-10-10")).scheduled).toBe(true);
	});
});
```

`tests/calendar.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { calendarStart, calendarWeeks } from "../src/ui/calendar";
import { d } from "./support/dates";
import { habitNote } from "./support/habits";

describe("calendar", () => {
	it("splits days into Monday-first weeks and hides future days", () => {
		const weeks = calendarWeeks(d("2026-10-01"), d("2026-10-09"));
		expect(weeks).toHaveLength(2);
		expect(weeks[0][0]?.toString()).toBe("2026-09-28");
		expect(weeks[1][4]?.toString()).toBe("2026-10-09");
		expect(weeks[1][5]).toBeUndefined();
	});

	it("starts a year back, or earlier if the habit is older", () => {
		expect(calendarStart(habitNote("Зарядка"), d("2026-10-09")).toString()).toBe("2025-10-10");
		const old = habitNote("Зарядка", {
			schedule: [{ value: ["mon"], since: "2024-01-01" }],
			anchor: [{ value: "Кружка", since: "2024-01-01" }],
			tiny: [{ value: "2", since: "2024-01-01" }],
		});
		expect(calendarStart(old, d("2026-10-09")).toString()).toBe("2024-01-01");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npx vitest run tests/Settings.test.ts tests/format.test.ts tests/order.test.ts tests/chain.test.ts tests/calendar.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать**

`src/settings.ts`:
```ts
export interface HabitSettings {
	folder: string;
	redesignThreshold: number;
	confetti: boolean;
}

export const DEFAULT_SETTINGS: HabitSettings = { folder: "Habits", redesignThreshold: 3, confetti: true };

export function loadSettings(data: unknown): HabitSettings {
	const raw = (typeof data === "object" && data !== null ? data : {}) as Partial<Record<keyof HabitSettings, unknown>>;
	const threshold = raw.redesignThreshold;
	return {
		folder: typeof raw.folder === "string" && raw.folder.trim() ? raw.folder.trim() : DEFAULT_SETTINGS.folder,
		redesignThreshold:
			typeof threshold === "number" && Number.isInteger(threshold) && threshold >= 1 ? threshold : DEFAULT_SETTINGS.redesignThreshold,
		confetti: typeof raw.confetti === "boolean" ? raw.confetti : DEFAULT_SETTINGS.confetti,
	};
}
```

`src/ui/format.ts`:
```ts
import { Habit, Part, RecipeChange } from "../domain/Habit";
import { LocalDate, Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { Breakdown } from "../domain/Stats";

const WEEKDAY_SHORT: Record<Weekday, string> = { mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс" };
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_LONG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const PART_LABELS: Record<Part, string> = {
	anchor: "якорь",
	tiny: "нано",
	full: "полное",
	celebration: "празднование",
	schedule: "расписание",
};

export const LEVEL_LABELS = { tiny: "нано", full: "полное" } as const;

export const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
	tiny: "нано",
	full: "полное",
	missed: "не получилось",
	empty: "пусто",
};

export function weekdayShort(day: Weekday): string {
	return WEEKDAY_SHORT[day];
}

export function scheduleLabel(schedule: Schedule): string {
	return schedule.isEveryDay ? "каждый день" : schedule.weekdays.map(weekdayShort).join(", ");
}

export function dayMonth(date: LocalDate): string {
	return `${date.day} ${MONTH_SHORT[date.month - 1]}`;
}

export function longDate(date: LocalDate): string {
	return `${weekdayShort(date.weekday())}, ${date.day} ${MONTH_LONG[date.month - 1]}`;
}

export function recipeLine(habit: Habit): string {
	const full = habit.text("full").current();
	const tiny = `нано: ${habit.text("tiny").current() ?? ""}`;
	return full ? `${tiny} · полное: ${full}` : tiny;
}

export function celebrationText(habit: Habit, kind: "tiny" | "full"): { title: string; subtitle: string } {
	const celebration = habit.text("celebration").current();
	return celebration
		? { title: celebration, subtitle: `${habit.name} · ${LEVEL_LABELS[kind]}` }
		: { title: habit.name, subtitle: LEVEL_LABELS[kind] };
}

export function describeChange(change: RecipeChange): string {
	const show = (value: string | Schedule | undefined) => (value instanceof Schedule ? scheduleLabel(value) : value);
	const from = show(change.from);
	const to = show(change.to);
	return `${PART_LABELS[change.part]}: ${from === undefined ? to : `${from} → ${to}`}`;
}
```

`src/ui/order.ts`:
```ts
import { HabitEntry } from "../application/ports";

const orderOf = (entry: HabitEntry) => (entry.kind === "ok" ? entry.habit.order : undefined);
const nameOf = (entry: HabitEntry) => (entry.kind === "ok" ? entry.habit.name : entry.name);

export function visibleEntries(entries: readonly HabitEntry[]): HabitEntry[] {
	return entries
		.filter((entry) => entry.kind === "broken" || !entry.habit.archived)
		.sort((a, b) => {
			const left = orderOf(a);
			const right = orderOf(b);
			if (left !== right) {
				if (left === undefined) return 1;
				if (right === undefined) return -1;
				return left - right;
			}
			return nameOf(a).localeCompare(nameOf(b));
		});
}
```

`src/ui/chain.ts`:
```ts
import { DayMark, isDone } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";

export interface CellLook {
	readonly mark?: DayMark;
	readonly scheduled: boolean;
	readonly joinLeft: boolean;
	readonly joinRight: boolean;
}

export function cellLook(habit: Habit, date: LocalDate): CellLook {
	const mark = habit.markOn(date);
	const done = isDone(mark);
	return {
		mark,
		scheduled: habit.isScheduled(date),
		joinLeft: done && isDone(habit.markOn(date.addDays(-1))),
		joinRight: done && isDone(habit.markOn(date.addDays(1))),
	};
}
```

`src/ui/calendar.ts`:
```ts
import { Habit } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";

const YEAR_DAYS = 364;

export function calendarStart(habit: Habit, today: LocalDate): LocalDate {
	const marks = habit.marks();
	const candidates = [today.addDays(-YEAR_DAYS), habit.createdOn, ...(marks.length ? [marks[marks.length - 1][0]] : [])];
	return candidates.reduce((earliest, date) => (date.isBefore(earliest) ? date : earliest));
}

export function calendarWeeks(from: LocalDate, today: LocalDate): Array<Array<LocalDate | undefined>> {
	const weeks: Array<Array<LocalDate | undefined>> = [];
	for (let monday = from.addDays(-WEEKDAYS.indexOf(from.weekday())); !monday.isAfter(today); monday = monday.addDays(7)) {
		weeks.push(
			WEEKDAYS.map((_, index) => {
				const date = monday.addDays(index);
				return date.isAfter(today) ? undefined : date;
			}),
		);
	}
	return weeks;
}
```

- [ ] **Step 4: Запустить все тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/ui tests
git commit -m "Add settings and pure UI helpers"
```

---

### Task 9: UI-компоненты — празднование, модалки отметки и создания

**Files:**
- Create: `src/ui/UiContext.ts`, `src/ui/WeekdayPicker.ts`, `src/ui/CelebrationOverlay.ts`, `src/ui/MissReasonModal.ts`, `src/ui/HabitFormModal.ts`

**Interfaces:**
- Consumes: `HabitService`, `HabitRepository`, `HabitSettings`, `NewHabit`, `LocalDate`, `WEEKDAYS`, `Weekday`, `longDate`, `weekdayShort`.
- Produces:
```ts
interface UiContext { readonly service: HabitService; readonly repository: HabitRepository; settings(): HabitSettings; openHabit(path: string): void; newHabit(): void }
class WeekdayPicker { constructor(parent: HTMLElement, initial: readonly Weekday[]); get days(): Weekday[] }
interface CelebrationInput { title: string; subtitle: string; streak: number; confetti: boolean }
function celebrate(input: CelebrationInput): void
interface MissReasonInput { habitName: string; date: LocalDate; anchor: string; reason?: string;
  onSave(reason: string): void; onDone(kind: "tiny" | "full"): void; onClear(): void }
class MissReasonModal extends Modal { constructor(app: App, input: MissReasonInput) }
class HabitFormModal extends Modal { constructor(app: App, service: HabitService) }
```
В этой задаче нет юнит-тестов: DOM и Obsidian. Проверка — `tsc` здесь и ручная проверка в Task 10.

- [ ] **Step 1: Реализовать UiContext и WeekdayPicker**

`src/ui/UiContext.ts`:
```ts
import { HabitService } from "../application/HabitService";
import { HabitRepository } from "../application/ports";
import { HabitSettings } from "../settings";

export interface UiContext {
	readonly service: HabitService;
	readonly repository: HabitRepository;
	settings(): HabitSettings;
	openHabit(path: string): void;
	newHabit(): void;
}
```

`src/ui/WeekdayPicker.ts`:
```ts
import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { weekdayShort } from "./format";

export class WeekdayPicker {
	private readonly selected: Set<Weekday>;

	constructor(parent: HTMLElement, initial: readonly Weekday[]) {
		this.selected = new Set(initial);
		const row = parent.createDiv("th-weekdays");
		for (const day of WEEKDAYS) {
			const chip = row.createEl("button", { cls: "th-weekday", text: weekdayShort(day) });
			chip.toggleClass("is-on", this.selected.has(day));
			chip.addEventListener("click", (event) => {
				event.preventDefault();
				if (this.selected.has(day)) this.selected.delete(day);
				else this.selected.add(day);
				chip.toggleClass("is-on", this.selected.has(day));
			});
		}
	}

	get days(): Weekday[] {
		return WEEKDAYS.filter((day) => this.selected.has(day));
	}
}
```

- [ ] **Step 2: Реализовать CelebrationOverlay**

`src/ui/CelebrationOverlay.ts`:
```ts
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
```

- [ ] **Step 3: Реализовать MissReasonModal**

`src/ui/MissReasonModal.ts`:
```ts
import { App, Modal } from "obsidian";
import { LocalDate } from "../domain/LocalDate";
import { longDate } from "./format";

export interface MissReasonInput {
	readonly habitName: string;
	readonly date: LocalDate;
	readonly anchor: string;
	readonly reason?: string;
	onSave(reason: string): void;
	onDone(kind: "tiny" | "full"): void;
	onClear(): void;
}

export class MissReasonModal extends Modal {
	constructor(
		app: App,
		private readonly input: MissReasonInput,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl, input } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Почему не получилось?" });
		contentEl.createDiv({ cls: "th-muted", text: `${input.habitName} · ${longDate(input.date)}` });
		if (input.anchor) {
			contentEl.createDiv({ cls: "th-label", text: "якорь" });
			contentEl.createDiv({ cls: "th-anchor", text: input.anchor });
		}
		const field = contentEl.createEl("input", { cls: "th-field", type: "text" });
		field.placeholder = "Что помешало?";
		field.value = input.reason ?? "";

		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { text: "Отмена" }).addEventListener("click", () => this.close());
		const save = buttons.createEl("button", { cls: "mod-cta", text: "Сохранить" });
		const sync = () => {
			save.disabled = field.value.trim() === "";
		};
		const submit = () => {
			const reason = field.value.trim();
			if (!reason) return;
			this.close();
			input.onSave(reason);
		};
		save.addEventListener("click", submit);
		field.addEventListener("input", sync);
		field.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			submit();
		});

		if (input.reason !== undefined) {
			const fixes = contentEl.createDiv("th-buttons th-fixes");
			const fix = (text: string, action: () => void) =>
				fixes.createEl("button", { text }).addEventListener("click", () => {
					this.close();
					action();
				});
			fix("Сделал нано", () => input.onDone("tiny"));
			fix("Сделал полное", () => input.onDone("full"));
			fix("Очистить", () => input.onClear());
		}
		sync();
		window.setTimeout(() => field.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
```

- [ ] **Step 4: Реализовать HabitFormModal**

`src/ui/HabitFormModal.ts`:
```ts
import { App, Modal, Notice } from "obsidian";
import { HabitService } from "../application/HabitService";
import { NewHabit } from "../domain/Habit";
import { WEEKDAYS } from "../domain/LocalDate";
import { WeekdayPicker } from "./WeekdayPicker";

export class HabitFormModal extends Modal {
	constructor(
		app: App,
		private readonly service: HabitService,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Новая привычка" });
		const field = (label: string, placeholder = "") => {
			contentEl.createDiv({ cls: "th-label", text: label });
			const input = contentEl.createEl("input", { cls: "th-field", type: "text" });
			input.placeholder = placeholder;
			return input;
		};
		const anchor = field("После того как я…");
		const tiny = field("я сделаю (нано)");
		const full = field("а стремлюсь к (полное)", "необязательно");
		const celebration = field("и отпраздную", "необязательно");
		contentEl.createDiv({ cls: "th-label", text: "дни" });
		const days = new WeekdayPicker(contentEl, WEEKDAYS);
		const name = field("название");

		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { cls: "mod-cta", text: "Создать" }).addEventListener("click", () => {
			void this.submit({
				name: name.value,
				anchor: anchor.value,
				tiny: tiny.value,
				full: full.value,
				celebration: celebration.value,
				days: days.days,
			});
		});
		window.setTimeout(() => anchor.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async submit(input: NewHabit): Promise<void> {
		try {
			await this.service.create(input);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
```

- [ ] **Step 5: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "Add celebration overlay, miss reason and new habit modals"
```

---

### Task 10: Репозиторий, сетка привычек, настройки и запуск плагина

**Files:**
- Create: `src/infrastructure/FrontmatterHabitRepository.ts`, `src/ui/HabitsView.ts`, `src/ui/SettingsTab.ts`, `src/main.ts`
- Modify: `styles.css` (весь файл)

**Interfaces:**
- Consumes: всё из Task 1–9.
- Produces:
```ts
class FrontmatterHabitRepository implements HabitRepository {
  constructor(app: App, folder: () => string)
  contains(path: string): boolean   // .md прямо в папке привычек
}
const HABITS_VIEW = "tiny-habits-grid"
class HabitsView extends ItemView { constructor(leaf: WorkspaceLeaf, ui: UiContext); refresh(): void }
interface SettingsHost { settings: HabitSettings; saveSettings(): Promise<void> }
class SettingsTab extends PluginSettingTab { constructor(app: App, host: Plugin & SettingsHost) }
default class TinyHabitsPlugin extends Plugin
```

- [ ] **Step 1: Реализовать репозиторий**

`src/infrastructure/FrontmatterHabitRepository.ts`:
```ts
import { App, TFile, TFolder, normalizePath } from "obsidian";
import { HabitEntry, HabitRepository } from "../application/ports";
import { DomainError } from "../domain/DomainError";
import { Habit } from "../domain/Habit";
import { HabitDecodeError, decodeHabit, encodeHabit } from "./HabitCodec";

export class FrontmatterHabitRepository implements HabitRepository {
	constructor(
		private readonly app: App,
		private readonly folder: () => string,
	) {}

	contains(path: string): boolean {
		const parent = path.slice(0, Math.max(0, path.lastIndexOf("/")));
		return path.endsWith(".md") && parent === this.folderPath();
	}

	list(): HabitEntry[] {
		const folder = this.app.vault.getAbstractFileByPath(this.folderPath());
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter((child): child is TFile => child instanceof TFile && child.extension === "md")
			.map((file) => this.read(file));
	}

	get(path: string): HabitEntry | undefined {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? this.read(file) : undefined;
	}

	async save(path: string, habit: Habit): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new DomainError("Заметка привычки не найдена");
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => encodeHabit(habit, frontmatter));
	}

	async create(habit: Habit): Promise<string> {
		const folder = this.folderPath();
		const path = normalizePath(`${folder}/${habit.name}.md`);
		if (this.app.vault.getAbstractFileByPath(path)) throw new DomainError(`Привычка «${habit.name}» уже есть`);
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		const file = await this.app.vault.create(path, "");
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => encodeHabit(habit, frontmatter));
		return path;
	}

	private folderPath(): string {
		return normalizePath(this.folder());
	}

	private read(file: TFile): HabitEntry {
		try {
			const habit = decodeHabit(file.basename, this.app.metadataCache.getFileCache(file)?.frontmatter);
			return { kind: "ok", path: file.path, habit };
		} catch (error) {
			if (error instanceof HabitDecodeError) return { kind: "broken", path: file.path, name: file.basename, problem: error.message };
			throw error;
		}
	}
}
```

- [ ] **Step 2: Реализовать сетку**

`src/ui/HabitsView.ts`:
```ts
import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { FULL, TINY, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { needsRedesign } from "../domain/RedesignRule";
import { computeStats } from "../domain/Stats";
import { celebrate } from "./CelebrationOverlay";
import { cellLook } from "./chain";
import { celebrationText, recipeLine, weekdayShort } from "./format";
import { MissReasonModal } from "./MissReasonModal";
import { visibleEntries } from "./order";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const PAGE_DAYS = 60;
const LONG_PRESS_MS = 500;
const LOAD_MORE_THRESHOLD_PX = 200;

export class HabitsView extends ItemView {
	private daysShown = PAGE_DAYS;
	private scroller: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ui: UiContext,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return HABITS_VIEW;
	}

	override getDisplayText(): string {
		return "Привычки";
	}

	override getIcon(): string {
		return "sprout";
	}

	override async onOpen(): Promise<void> {
		this.render();
		window.requestAnimationFrame(() => {
			if (this.scroller) this.scroller.scrollLeft = this.scroller.scrollWidth;
		});
	}

	refresh(): void {
		const fromRight = this.scroller ? this.scroller.scrollWidth - this.scroller.scrollLeft : 0;
		this.render();
		if (this.scroller) this.scroller.scrollLeft = this.scroller.scrollWidth - fromRight;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("tiny-habits");
		const header = root.createDiv("th-header");
		header.createDiv({ cls: "th-title", text: "Привычки" });
		const actions = header.createDiv("th-actions");
		this.button(actions, "‹", "Раньше", () => this.page(-1));
		this.button(actions, "›", "Позже", () => this.page(1));
		this.button(actions, "+", "Новая привычка", () => this.ui.newHabit());

		const entries = visibleEntries(this.ui.repository.list());
		if (entries.length === 0) {
			this.scroller = null;
			const empty = root.createDiv("th-empty");
			empty.createDiv({ text: "Привычек пока нет" });
			this.button(empty, "Новая привычка", "Новая привычка", () => this.ui.newHabit());
			return;
		}

		const today = this.ui.service.today();
		const days = Array.from({ length: this.daysShown }, (_, index) => today.addDays(index - this.daysShown + 1));
		const grid = root.createDiv("th-grid");
		const names = grid.createDiv("th-names");
		names.createDiv("th-corner");
		const scroller = grid.createDiv("th-scroller");
		this.scroller = scroller;

		const dates = scroller.createDiv("th-row th-dates");
		for (const day of days) {
			const cell = dates.createDiv(day.equals(today) ? "th-date is-today" : "th-date");
			cell.createDiv({ text: weekdayShort(day.weekday()) });
			cell.createDiv({ cls: "th-date-number", text: String(day.day) });
		}
		for (const entry of entries) {
			this.renderName(names, entry);
			const row = scroller.createDiv("th-row");
			if (entry.kind === "broken") continue;
			for (const day of days) this.renderCell(row, entry.path, entry.habit, day);
		}
		scroller.addEventListener("scroll", () => {
			if (scroller.scrollLeft < LOAD_MORE_THRESHOLD_PX) this.loadMore();
		});
	}

	private renderName(parent: HTMLElement, entry: HabitEntry): void {
		const cell = parent.createDiv("th-name");
		if (entry.kind === "broken") {
			cell.addClass("is-broken");
			cell.createDiv({ cls: "th-name-title", text: entry.name });
			cell.createDiv({ cls: "th-name-sub", text: `Не удалось прочитать: ${entry.problem}` });
			cell.addEventListener("click", () => void this.app.workspace.openLinkText(entry.path, "", "tab"));
			return;
		}
		const title = cell.createDiv({ cls: "th-name-title", text: entry.habit.name });
		if (needsRedesign(entry.habit, this.ui.settings().redesignThreshold)) title.createSpan({ cls: "th-redesign", text: " ↻" });
		cell.createDiv({ cls: "th-name-sub", text: recipeLine(entry.habit) });
		cell.addEventListener("click", () => this.ui.openHabit(entry.path));
	}

	private renderCell(row: HTMLElement, path: string, habit: Habit, day: LocalDate): void {
		const look = cellLook(habit, day);
		const cell = row.createDiv("th-cell");
		cell.toggleClass("is-off", !look.scheduled && !look.mark);
		cell.toggleClass("join-left", look.joinLeft);
		cell.toggleClass("join-right", look.joinRight);
		if (look.mark) cell.addClass(`is-${look.mark.kind}`);
		cell.createDiv("th-dot");
		this.bindCell(
			cell,
			() => void this.tap(path, habit, day),
			() => this.openMiss(path, habit, day),
		);
	}

	private bindCell(cell: HTMLElement, onTap: () => void, onLongPress: () => void): void {
		let timer = 0;
		let longPressed = false;
		const cancel = () => window.clearTimeout(timer);
		cell.addEventListener("pointerdown", () => {
			longPressed = false;
			timer = window.setTimeout(() => {
				longPressed = true;
				onLongPress();
			}, LONG_PRESS_MS);
		});
		for (const type of ["pointerup", "pointerleave", "pointercancel"]) cell.addEventListener(type, cancel);
		cell.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			cancel();
			if (longPressed) return;
			longPressed = true;
			onLongPress();
		});
		cell.addEventListener("click", () => {
			if (!longPressed) onTap();
		});
	}

	private async tap(path: string, habit: Habit, day: LocalDate): Promise<void> {
		if (habit.markOn(day)?.kind === "missed") {
			this.openMiss(path, habit, day);
			return;
		}
		await this.run(async () => this.celebrateIfDone(await this.ui.service.cycle(path, day), day));
	}

	private openMiss(path: string, habit: Habit, day: LocalDate): void {
		const mark = habit.markOn(day);
		const anchor = habit.text("anchor");
		new MissReasonModal(this.app, {
			habitName: habit.name,
			date: day,
			anchor: anchor.at(day) ?? anchor.current() ?? "",
			reason: mark?.kind === "missed" ? mark.reason : undefined,
			onSave: (reason) => void this.run(() => this.ui.service.setMark(path, day, missed(reason))),
			onDone: (kind) =>
				void this.run(async () => this.celebrateIfDone(await this.ui.service.setMark(path, day, kind === "tiny" ? TINY : FULL), day)),
			onClear: () => void this.run(() => this.ui.service.setMark(path, day, undefined)),
		}).open();
	}

	private celebrateIfDone(habit: Habit, day: LocalDate): void {
		const mark = habit.markOn(day);
		if (!mark || mark.kind === "missed") return;
		celebrate({
			...celebrationText(habit, mark.kind),
			streak: computeStats(habit, this.ui.service.today()).current?.length ?? 0,
			confetti: this.ui.settings().confetti,
		});
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private loadMore(): void {
		this.daysShown += PAGE_DAYS;
		this.refresh();
	}

	private page(direction: -1 | 1): void {
		this.scroller?.scrollBy({ left: direction * this.scroller.clientWidth, behavior: "smooth" });
	}

	private button(parent: HTMLElement, text: string, label: string, onClick: () => void): void {
		const button = parent.createEl("button", { cls: "th-button", text });
		button.setAttribute("aria-label", label);
		button.addEventListener("click", onClick);
	}
}
```

- [ ] **Step 3: Реализовать настройки**

`src/ui/SettingsTab.ts`:
```ts
import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, HabitSettings } from "../settings";

export interface SettingsHost {
	settings: HabitSettings;
	saveSettings(): Promise<void>;
}

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: Plugin & SettingsHost,
	) {
		super(app, host);
	}

	override display(): void {
		const { containerEl, host } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Папка привычек")
			.setDesc("Одна заметка — одна привычка. Подпапки не учитываются.")
			.addText((text) =>
				text.setValue(host.settings.folder).onChange(async (value) => {
					host.settings.folder = value.trim() || DEFAULT_SETTINGS.folder;
					await host.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Подсказка «переделай рецепт»")
			.setDesc("Сколько «не получилось» подряд после последнего выполнения")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(host.settings.redesignThreshold)).onChange(async (value) => {
					const threshold = Number(value);
					if (!Number.isInteger(threshold) || threshold < 1) return;
					host.settings.redesignThreshold = threshold;
					await host.saveSettings();
				});
			});
		new Setting(containerEl).setName("Конфетти").addToggle((toggle) =>
			toggle.setValue(host.settings.confetti).onChange(async (value) => {
				host.settings.confetti = value;
				await host.saveSettings();
			}),
		);
	}
}
```

- [ ] **Step 4: Реализовать main.ts**

`src/main.ts`:
```ts
import { Plugin } from "obsidian";
import { HabitService } from "./application/HabitService";
import { systemClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HABITS_VIEW, HabitsView } from "./ui/HabitsView";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";
import { UiContext } from "./ui/UiContext";

export default class TinyHabitsPlugin extends Plugin implements SettingsHost {
	override settings: HabitSettings = loadSettings(null);

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		const repository = new FrontmatterHabitRepository(this.app, () => this.settings.folder);
		const service = new HabitService(repository, systemClock);
		const ui: UiContext = {
			service,
			repository,
			settings: () => this.settings,
			openHabit: (path) => void this.app.workspace.openLinkText(path, "", "tab"),
			newHabit: () => new HabitFormModal(this.app, service).open(),
		};

		this.registerView(HABITS_VIEW, (leaf) => new HabitsView(leaf, ui));
		this.addRibbonIcon("sprout", "Привычки", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Открыть привычки", callback: () => void this.openGrid() });
		this.addCommand({ id: "new", name: "Новая привычка", callback: () => ui.newHabit() });
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => refreshIfHabit(file.path, oldPath)));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(HABITS_VIEW)) {
			if (leaf.view instanceof HabitsView) leaf.view.refresh();
		}
	}

	private async openGrid(): Promise<void> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}
}
```

- [ ] **Step 5: Стили**

`styles.css`, весь файл:
```css
.tiny-habits {
	--th-accent: var(--interactive-accent);
	--th-soft: color-mix(in srgb, var(--interactive-accent) 35%, transparent);
	--th-cell: 36px;
	--th-row: 52px;
	--th-head: 44px;
	padding: 16px;
}

.th-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.th-title { font-size: var(--font-ui-large); font-weight: 600; }
.th-actions { display: flex; gap: 6px; }
.th-button { min-width: 32px; }
.th-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 0; color: var(--text-muted); }
.th-muted { color: var(--text-muted); font-size: var(--font-ui-small); }

.th-grid { display: flex; }
.th-names { flex: 0 0 auto; max-width: 45%; min-width: 120px; }
.th-corner { height: var(--th-head); }
.th-name { height: var(--th-row); display: flex; flex-direction: column; justify-content: center; padding-right: 12px; cursor: pointer; overflow: hidden; }
.th-name-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.th-name-sub { font-size: var(--font-ui-smaller); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.th-name.is-broken { opacity: 0.6; }
.th-redesign { color: var(--th-accent); }

.th-scroller { flex: 1 1 auto; overflow-x: auto; scrollbar-width: thin; }
.th-row { display: flex; height: var(--th-row); width: max-content; min-width: 100%; align-items: center; }
.th-row.th-dates { height: var(--th-head); }
.th-date { width: var(--th-cell); text-align: center; font-size: var(--font-ui-smaller); color: var(--text-muted); line-height: 1.3; }
.th-date-number { color: var(--text-normal); font-weight: 600; }
.th-date.is-today .th-date-number { color: var(--th-accent); }

.th-cell { width: var(--th-cell); height: var(--th-row); position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.th-dot { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--background-modifier-border); box-sizing: border-box; position: relative; z-index: 1; }
.th-cell.is-off .th-dot { border-style: dashed; opacity: 0.5; }
.th-cell.is-tiny .th-dot { background: var(--th-soft); border-color: transparent; }
.th-cell.is-full .th-dot { background: var(--th-accent); border-color: transparent; }
.th-cell.is-missed .th-dot { border-color: var(--text-faint); }
.th-cell.is-missed .th-dot::after { content: ""; position: absolute; left: 4px; right: 4px; top: 50%; height: 1.5px; margin-top: -0.75px; background: var(--text-faint); }
.th-cell.join-left::before,
.th-cell.join-right::after { content: ""; position: absolute; top: 50%; height: 14px; margin-top: -7px; width: 50%; background: var(--th-soft); }
.th-cell.join-left::before { left: 0; }
.th-cell.join-right::after { right: 0; }

.th-modal .th-label { font-size: var(--font-ui-smaller); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-top: 14px; }
.th-modal .th-field { width: 100%; margin-top: 6px; font-size: var(--font-ui-medium); }
.th-anchor { margin-top: 4px; }
.th-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap; }
.th-fixes { justify-content: flex-start; border-top: 1px solid var(--background-modifier-border); padding-top: 14px; }
.th-vertical { flex-direction: column; align-items: stretch; }
.th-weekdays { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.th-weekday { width: 36px; height: 36px; border-radius: 50%; padding: 0; }
.th-weekday.is-on { background: var(--interactive-accent); color: var(--text-on-accent); }

.th-celebration { position: fixed; inset: 0; z-index: var(--layer-notice); display: flex; align-items: center; justify-content: center; overflow: hidden; background: color-mix(in srgb, var(--background-primary) 70%, transparent); animation: th-fade 1.5s ease forwards; }
.th-celebration-card { text-align: center; animation: th-pop 0.35s ease-out; }
.th-celebration-ring { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%; background: var(--interactive-accent); box-shadow: 0 0 0 10px color-mix(in srgb, var(--interactive-accent) 15%, transparent), 0 0 0 20px color-mix(in srgb, var(--interactive-accent) 7%, transparent); }
.th-celebration-title { font-size: 32px; font-weight: 700; margin-bottom: 6px; }
.th-confetti { position: absolute; top: -16px; left: var(--th-x); width: 8px; height: 14px; border-radius: 2px; background: hsl(var(--th-hue) 80% 65%); animation: th-fall 1.4s ease-in var(--th-delay) forwards; }

@keyframes th-fall { to { transform: translateY(110vh) rotate(var(--th-turn)); } }
@keyframes th-pop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes th-fade { 0%, 75% { opacity: 1; } 100% { opacity: 0; } }
```

- [ ] **Step 6: Сборка и тесты**

Run: `npm test && npm run build`
Expected: тесты PASS, `tsc` без ошибок, появился `main.js`.

- [ ] **Step 7: Деплой и ручная проверка в Obsidian**

Run: `npm run deploy`
Expected: `Deployed to /Users/mdmkudryashov/Obsidian/.obsidian/plugins/tiny-habits`.

Перезагрузить Obsidian (команда «Reload app without saving»), включить Tiny Habits в Community plugins и проверить:
1. Иконка-росток открывает вкладку «Привычки» с текстом «Привычек пока нет».
2. «+» открывает форму. Создать привычку «Зарядка» без якоря → Notice «Не заполнен якорь». С якорем и нано → появился `Habits/Зарядка.md`, frontmatter как в разделе 5 спеки.
3. Тап по сегодняшней клетке → нано и празднование с конфетти; ещё тап → полное; ещё тап → пусто. После каждого тапа в заметке меняются `done_tiny` и `done_full`.
4. Правый клик по вчерашней клетке → «Почему не получилось?»; «Сохранить» неактивна при пустом поле; после сохранения клетка перечёркнута, в заметке `missed`.
5. Тап по перечёркнутой клетке открывает окно с причиной и кнопками «Сделал нано», «Сделал полное», «Очистить»; «Сделал нано» показывает празднование.
6. Две отмеченные подряд клетки соединены перемычкой.
7. Горизонтальный скролл трекпадом листает назад; у левого края подгружаются ещё дни; ‹ › листают на ширину экрана.
8. Ручная правка `done_tiny` в Properties сразу отражается в сетке.
9. Испортить дату в `done_tiny` руками → строка приглушена с «Не удалось прочитать: …», остальные привычки работают. Вернуть как было.
10. Добавить `order: 1` второй привычке → она встаёт первой.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add habits grid view, repository and plugin entry point"
```

---

### Task 11: Экран привычки и редактирование рецепта

**Files:**
- Create: `src/ui/ComponentModal.ts`, `src/ui/PartPickerModal.ts`, `src/ui/HabitScreenView.ts`
- Modify: `src/main.ts` (весь файл), `styles.css` (дописать в конец)

**Interfaces:**
- Consumes: `UiContext`, `HabitService`, `Habit`, `TEXT_PARTS`, `Part`, `TextPart`, `Schedule`, `Weekday`, `computeStats`, `WINDOW_DAYS`, `HabitStats`, `missesInARow`, `needsRedesign`, `calendarStart`, `calendarWeeks`, `PART_LABELS`, `BREAKDOWN_LABELS`, `scheduleLabel`, `dayMonth`, `describeChange`, `WeekdayPicker`.
- Produces:
```ts
interface ComponentActions<T> { replace(value: T, because: string): Promise<unknown>; correct(value: T): Promise<unknown> }
class TextComponentModal extends Modal { constructor(app: App, part: TextPart, current: string | undefined, actions: ComponentActions<string>) }
class ScheduleModal extends Modal { constructor(app: App, current: Schedule, actions: ComponentActions<Weekday[]>) }
class PartPickerModal extends Modal { constructor(app: App, onPick: (part: Part) => void) }
const HABIT_VIEW = "tiny-habits-habit"
class HabitScreenView extends ItemView { constructor(leaf: WorkspaceLeaf, ui: UiContext); refresh(): void; renamed(oldPath: string, newPath: string): void }
```

- [ ] **Step 1: Реализовать модалки компонента и выбора**

`src/ui/ComponentModal.ts`:
```ts
import { App, Modal, Notice } from "obsidian";
import { TextPart } from "../domain/Habit";
import { Weekday } from "../domain/LocalDate";
import { Schedule } from "../domain/Schedule";
import { PART_LABELS } from "./format";
import { WeekdayPicker } from "./WeekdayPicker";

export interface ComponentActions<T> {
	replace(value: T, because: string): Promise<unknown>;
	correct(value: T): Promise<unknown>;
}

abstract class ComponentModal<T> extends Modal {
	protected constructor(
		app: App,
		private readonly title: string,
		private readonly hasCurrent: boolean,
		private readonly actions: ComponentActions<T>,
	) {
		super(app);
	}

	protected abstract renderValue(parent: HTMLElement): () => T;

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: this.title });
		const value = this.renderValue(contentEl);
		if (!this.hasCurrent) {
			const buttons = contentEl.createDiv("th-buttons");
			buttons.createEl("button", { cls: "mod-cta", text: "Добавить" }).addEventListener("click", () => {
				void this.apply(() => this.actions.replace(value(), ""));
			});
			return;
		}
		contentEl.createDiv({ cls: "th-label", text: "Почему старое не подошло?" });
		const because = contentEl.createEl("input", { cls: "th-field", type: "text" });
		because.placeholder = "можно пропустить";
		const buttons = contentEl.createDiv("th-buttons");
		buttons.createEl("button", { text: "Исправить" }).addEventListener("click", () => {
			void this.apply(() => this.actions.correct(value()));
		});
		buttons.createEl("button", { cls: "mod-cta", text: "Заменить" }).addEventListener("click", () => {
			void this.apply(() => this.actions.replace(value(), because.value));
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async apply(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}

export class TextComponentModal extends ComponentModal<string> {
	constructor(
		app: App,
		part: TextPart,
		private readonly current: string | undefined,
		actions: ComponentActions<string>,
	) {
		super(app, PART_LABELS[part], current !== undefined, actions);
	}

	protected override renderValue(parent: HTMLElement): () => string {
		const input = parent.createEl("input", { cls: "th-field", type: "text" });
		input.value = this.current ?? "";
		window.setTimeout(() => input.focus(), 0);
		return () => input.value;
	}
}

export class ScheduleModal extends ComponentModal<Weekday[]> {
	constructor(
		app: App,
		private readonly current: Schedule,
		actions: ComponentActions<Weekday[]>,
	) {
		super(app, PART_LABELS.schedule, true, actions);
	}

	protected override renderValue(parent: HTMLElement): () => Weekday[] {
		const picker = new WeekdayPicker(parent, this.current.weekdays);
		return () => picker.days;
	}
}
```

`src/ui/PartPickerModal.ts`:
```ts
import { App, Modal } from "obsidian";
import { Part, TEXT_PARTS } from "../domain/Habit";
import { PART_LABELS } from "./format";

const PARTS: readonly Part[] = [...TEXT_PARTS, "schedule"];

export class PartPickerModal extends Modal {
	constructor(
		app: App,
		private readonly onPick: (part: Part) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("th-modal");
		contentEl.createEl("h3", { text: "Что поменять?" });
		const list = contentEl.createDiv("th-buttons th-vertical");
		for (const part of PARTS) {
			list.createEl("button", { text: PART_LABELS[part] }).addEventListener("click", () => {
				this.close();
				this.onPick(part);
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
```

- [ ] **Step 2: Реализовать экран привычки**

`src/ui/HabitScreenView.ts`:
```ts
import { ItemView, Notice, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { Habit, Part, TEXT_PARTS } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { missesInARow, needsRedesign } from "../domain/RedesignRule";
import { HabitStats, WINDOW_DAYS, computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { ScheduleModal, TextComponentModal } from "./ComponentModal";
import { BREAKDOWN_LABELS, PART_LABELS, dayMonth, describeChange, scheduleLabel } from "./format";
import { PartPickerModal } from "./PartPickerModal";
import { UiContext } from "./UiContext";

export const HABIT_VIEW = "tiny-habits-habit";

const BREAKDOWN_ORDER = ["tiny", "full", "missed", "empty"] as const;
const STREAK_BAR_PX = 200;

function section(root: HTMLElement, title: string): void {
	root.createEl("h4", { cls: "th-section", text: title });
}

export class HabitScreenView extends ItemView {
	private path = "";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ui: UiContext,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return HABIT_VIEW;
	}

	override getDisplayText(): string {
		const entry = this.entry();
		if (entry?.kind === "ok") return entry.habit.name;
		return entry?.name ?? "Привычка";
	}

	override getIcon(): string {
		return "sprout";
	}

	override getState(): Record<string, unknown> {
		return { path: this.path };
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const path = (state as { path?: unknown } | null)?.path;
		if (typeof path === "string") this.path = path;
		this.render();
		await super.setState(state, result);
	}

	refresh(): void {
		this.render();
	}

	renamed(oldPath: string, newPath: string): void {
		if (this.path !== oldPath) return;
		this.path = newPath;
		this.render();
	}

	private entry(): HabitEntry | undefined {
		return this.path ? this.ui.repository.get(this.path) : undefined;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("tiny-habits", "th-screen");
		const entry = this.entry();
		if (!entry) {
			root.createDiv({ cls: "th-empty", text: "Привычка не найдена" });
			return;
		}
		if (entry.kind === "broken") {
			root.createDiv({ cls: "th-empty", text: `Не удалось прочитать: ${entry.problem}` });
			return;
		}
		const habit = entry.habit;
		const today = this.ui.service.today();
		const stats = computeStats(habit, today);
		root.createDiv({ cls: "th-screen-title", text: habit.name });
		root.createDiv({ cls: "th-muted", text: scheduleLabel(habit.currentSchedule) });
		this.renderRecipe(root, habit);
		if (needsRedesign(habit, this.ui.settings().redesignThreshold)) this.renderRedesign(root, habit);
		this.renderStats(root, stats);
		this.renderCalendar(root, habit, today);
		this.renderStreaks(root, stats);
		this.renderMisses(root, habit);
		this.renderHistory(root, habit);
		this.renderFooter(root);
	}

	private renderRecipe(root: HTMLElement, habit: Habit): void {
		const recipe = root.createDiv("th-recipe");
		const row = (part: Part, value: string | undefined) => {
			const line = recipe.createDiv("th-recipe-row");
			line.createSpan({ cls: "th-recipe-key", text: PART_LABELS[part] });
			line.createSpan({ cls: value ? "th-recipe-value" : "th-recipe-value is-empty", text: value ?? "добавить" });
			line.addEventListener("click", () => this.editPart(part));
		};
		for (const part of TEXT_PARTS) row(part, habit.text(part).current());
		row("schedule", scheduleLabel(habit.currentSchedule));
	}

	private editPart(part: Part): void {
		const entry = this.entry();
		if (entry?.kind !== "ok") return;
		const { service } = this.ui;
		const path = this.path;
		if (part === "schedule") {
			new ScheduleModal(this.app, entry.habit.currentSchedule, {
				replace: (days, because) => service.replaceSchedule(path, days, because),
				correct: (days) => service.correctSchedule(path, days),
			}).open();
			return;
		}
		new TextComponentModal(this.app, part, entry.habit.text(part).current(), {
			replace: (value, because) => service.replaceText(path, part, value, because),
			correct: (value) => service.correctText(path, part, value),
		}).open();
	}

	private renderRedesign(root: HTMLElement, habit: Habit): void {
		const banner = root.createDiv("th-banner");
		banner.createSpan({
			text: `${missesInARow(habit)} «не получилось» подряд после последнего выполнения. Может, переделать рецепт?`,
		});
		banner.createEl("button", { cls: "mod-cta", text: "Переделать" }).addEventListener("click", () => {
			new PartPickerModal(this.app, (part) => this.editPart(part)).open();
		});
	}

	private renderStats(root: HTMLElement, stats: HabitStats): void {
		section(root, `Последние ${WINDOW_DAYS} дней`);
		const tiles = root.createDiv("th-tiles");
		const tile = (value: string, label: string) => {
			const item = tiles.createDiv("th-tile");
			item.createDiv({ cls: "th-tile-value", text: value });
			item.createDiv({ cls: "th-muted", text: label });
		};
		const { window: period } = stats;
		tile(period.percent === null ? "—" : `${period.percent}%`, `${period.done} из ${period.scheduled} запланированных дней`);
		tile(String(stats.current?.length ?? 0), "текущая серия");
		tile(String(stats.best), "лучшая серия");
		tile(String(stats.total), "всего выполнений");
		const bar = root.createDiv("th-bar");
		const legend = root.createDiv("th-legend");
		for (const kind of BREAKDOWN_ORDER) {
			const count = period.breakdown[kind];
			if (count) bar.createDiv(`th-bar-part is-${kind}`).style.flexGrow = String(count);
			const item = legend.createSpan(`th-legend-item is-${kind}`);
			item.createSpan("th-legend-dot");
			item.appendText(`${BREAKDOWN_LABELS[kind]} ${count}`);
		}
	}

	private renderCalendar(root: HTMLElement, habit: Habit, today: LocalDate): void {
		section(root, "Календарь");
		const changes = habit.changes();
		const changed = new Set(changes.map((change) => change.date.toString()));
		const scroller = root.createDiv("th-calendar-scroller");
		const calendar = scroller.createDiv("th-calendar");
		for (const week of calendarWeeks(calendarStart(habit, today), today)) {
			const column = calendar.createDiv("th-calendar-week");
			for (const date of week) {
				const cell = column.createDiv("th-calendar-day");
				if (!date) {
					cell.addClass("is-future");
					continue;
				}
				const mark = habit.markOn(date);
				cell.addClass(mark ? `is-${mark.kind}` : habit.isScheduled(date) ? "is-empty" : "is-off");
				cell.setAttribute("aria-label", dayMonth(date));
				if (!changed.has(date.toString())) continue;
				cell.addClass("is-changed");
				cell.addEventListener("click", () => {
					new Notice(
						changes
							.filter((change) => change.date.equals(date))
							.map(describeChange)
							.join("\n"),
					);
				});
			}
		}
		window.requestAnimationFrame(() => {
			scroller.scrollLeft = scroller.scrollWidth;
		});
	}

	private renderStreaks(root: HTMLElement, stats: HabitStats): void {
		section(root, "Серии");
		if (stats.streaks.length === 0) {
			root.createDiv({ cls: "th-muted", text: "Пока нет" });
			return;
		}
		const longest = Math.max(...stats.streaks.map((streak) => streak.length));
		for (const streak of stats.streaks) {
			const isCurrent = streak === stats.current;
			const row = root.createDiv("th-streak");
			const bar = row.createDiv(isCurrent ? "th-streak-bar is-current" : "th-streak-bar");
			bar.style.width = `${Math.max(6, Math.round((streak.length / longest) * STREAK_BAR_PX))}px`;
			row.createSpan({
				text: `${streak.length} · ${dayMonth(streak.start)} – ${isCurrent ? "сейчас" : dayMonth(streak.end)}`,
			});
		}
	}

	private renderMisses(root: HTMLElement, habit: Habit): void {
		section(root, "Не получилось");
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		if (misses.length === 0) {
			root.createDiv({ cls: "th-muted", text: "Пока нет" });
			return;
		}
		for (const miss of misses) {
			const row = root.createDiv("th-list-row");
			row.createSpan({ cls: "th-list-date", text: dayMonth(miss.date) });
			row.createSpan({ text: miss.reason });
		}
	}

	private renderHistory(root: HTMLElement, habit: Habit): void {
		section(root, "История рецепта");
		for (const change of habit.changes()) {
			const row = root.createDiv("th-list-row");
			row.createSpan({ cls: "th-list-date", text: dayMonth(change.date) });
			const body = row.createDiv();
			body.createDiv({ text: describeChange(change) });
			if (change.because) body.createDiv({ cls: "th-muted", text: change.because });
		}
		const created = root.createDiv("th-list-row");
		created.createSpan({ cls: "th-list-date", text: dayMonth(habit.createdOn) });
		created.createSpan({ text: "создана" });
	}

	private renderFooter(root: HTMLElement): void {
		const footer = root.createDiv("th-buttons th-footer");
		footer.createEl("button", { text: "Открыть заметку" }).addEventListener("click", () => {
			void this.app.workspace.openLinkText(this.path, "", "tab");
		});
		footer.createEl("button", { text: "Архивировать" }).addEventListener("click", () => void this.archive());
	}

	private async archive(): Promise<void> {
		try {
			await this.ui.service.archive(this.path);
			this.leaf.detach();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
```

- [ ] **Step 3: Подключить экран в main.ts**

`src/main.ts`, весь файл:
```ts
import { Plugin } from "obsidian";
import { HabitService } from "./application/HabitService";
import { systemClock } from "./domain/Clock";
import { FrontmatterHabitRepository } from "./infrastructure/FrontmatterHabitRepository";
import { HabitSettings, loadSettings } from "./settings";
import { HabitFormModal } from "./ui/HabitFormModal";
import { HABIT_VIEW, HabitScreenView } from "./ui/HabitScreenView";
import { HABITS_VIEW, HabitsView } from "./ui/HabitsView";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";
import { UiContext } from "./ui/UiContext";

export default class TinyHabitsPlugin extends Plugin implements SettingsHost {
	override settings: HabitSettings = loadSettings(null);

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		const repository = new FrontmatterHabitRepository(this.app, () => this.settings.folder);
		const service = new HabitService(repository, systemClock);
		const ui: UiContext = {
			service,
			repository,
			settings: () => this.settings,
			openHabit: (path) => void this.openHabit(path),
			newHabit: () => new HabitFormModal(this.app, service).open(),
		};

		this.registerView(HABITS_VIEW, (leaf) => new HabitsView(leaf, ui));
		this.registerView(HABIT_VIEW, (leaf) => new HabitScreenView(leaf, ui));
		this.addRibbonIcon("sprout", "Привычки", () => void this.openGrid());
		this.addCommand({ id: "open", name: "Открыть привычки", callback: () => void this.openGrid() });
		this.addCommand({ id: "new", name: "Новая привычка", callback: () => ui.newHabit() });
		this.addSettingTab(new SettingsTab(this.app, this));

		const refreshIfHabit = (...paths: string[]) => {
			if (paths.some((path) => repository.contains(path))) this.refreshViews();
		};
		this.registerEvent(this.app.metadataCache.on("changed", (file) => refreshIfHabit(file.path)));
		this.registerEvent(this.app.vault.on("delete", (file) => refreshIfHabit(file.path)));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				for (const view of this.habitScreens()) view.renamed(oldPath, file.path);
				refreshIfHabit(file.path, oldPath);
			}),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private habitScreens(): HabitScreenView[] {
		return this.app.workspace
			.getLeavesOfType(HABIT_VIEW)
			.flatMap((leaf) => (leaf.view instanceof HabitScreenView ? [leaf.view] : []));
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(HABITS_VIEW)) {
			if (leaf.view instanceof HabitsView) leaf.view.refresh();
		}
		for (const view of this.habitScreens()) view.refresh();
	}

	private async openGrid(): Promise<void> {
		const [existing] = this.app.workspace.getLeavesOfType(HABITS_VIEW);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type: HABITS_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	private async openHabit(path: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: HABIT_VIEW, active: true, state: { path } });
	}
}
```

- [ ] **Step 4: Стили экрана привычки**

Дописать в конец `styles.css`:
```css
.th-screen { max-width: 680px; margin: 0 auto; }
.th-screen-title { font-size: 24px; font-weight: 700; }
.th-recipe { margin-top: 16px; }
.th-recipe-row { display: flex; gap: 12px; padding: 4px 0; cursor: pointer; }
.th-recipe-key { width: 110px; flex-shrink: 0; color: var(--text-muted); font-size: var(--font-ui-small); padding-top: 2px; }
.th-recipe-value { border-bottom: 1px dashed var(--background-modifier-border); }
.th-recipe-value.is-empty { color: var(--text-faint); }
.th-banner { margin-top: 18px; padding: 12px 14px; border-radius: 10px; display: flex; gap: 12px; align-items: center; justify-content: space-between; background: color-mix(in srgb, var(--interactive-accent) 10%, transparent); }
.th-section { font-size: var(--font-ui-smaller); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 28px 0 10px; }
.th-tiles { display: flex; gap: 28px; flex-wrap: wrap; }
.th-tile-value { font-size: 32px; font-weight: 700; line-height: 1.1; }
.th-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 14px; background: var(--background-modifier-border); }
.th-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; font-size: var(--font-ui-small); color: var(--text-muted); }
.th-legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
.th-bar-part.is-tiny, .th-legend-item.is-tiny .th-legend-dot { background: var(--th-soft); }
.th-bar-part.is-full, .th-legend-item.is-full .th-legend-dot { background: var(--th-accent); }
.th-bar-part.is-missed, .th-legend-item.is-missed .th-legend-dot { background: var(--text-faint); }
.th-bar-part.is-empty, .th-legend-item.is-empty .th-legend-dot { background: var(--background-modifier-border); }
.th-calendar-scroller { overflow-x: auto; padding-bottom: 4px; }
.th-calendar { display: flex; gap: 3px; width: max-content; }
.th-calendar-week { display: flex; flex-direction: column; gap: 3px; }
.th-calendar-day { width: 13px; height: 13px; border-radius: 3px; background: var(--background-modifier-border); }
.th-calendar-day.is-off { background: transparent; }
.th-calendar-day.is-future { visibility: hidden; }
.th-calendar-day.is-tiny { background: var(--th-soft); }
.th-calendar-day.is-full { background: var(--th-accent); }
.th-calendar-day.is-missed { background: transparent; box-shadow: inset 0 0 0 1.5px var(--text-faint); }
.th-calendar-day.is-changed { outline: 2px solid var(--text-normal); outline-offset: -1px; cursor: pointer; }
.th-streak { display: flex; align-items: center; gap: 10px; margin: 6px 0; font-size: var(--font-ui-small); color: var(--text-muted); }
.th-streak-bar { height: 10px; border-radius: 5px; background: var(--th-soft); }
.th-streak-bar.is-current { background: var(--th-accent); }
.th-list-row { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--background-modifier-border); }
.th-list-date { width: 64px; flex-shrink: 0; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.th-footer { justify-content: flex-start; margin-top: 28px; }
```

- [ ] **Step 5: Сборка, деплой, ручная проверка**

Run: `npm test && npm run deploy`
Expected: тесты PASS, сборка без ошибок, деплой прошёл.

Перезагрузить Obsidian и проверить:
1. Тап по названию привычки в сетке открывает вкладку экрана привычки. Название вкладки — имя привычки.
2. Рецепт: тап по «якорь» → «Заменить» с причиной → в истории строка «якорь: старое → новое», под ней причина; в заметке причина лежит у старой версии в `replaced_because`.
3. «Исправить» меняет текст без новой строки истории.
4. Пустое «полное» показано как «добавить»; тап → «Добавить» → значение появилось, в истории «полное: …».
5. Расписание: замена на «сб» → подпись под названием «сб»; в сетке будни стали пунктирными.
6. Три «не получилось» подряд → баннер «3 «не получилось» подряд…», значок ↻ в сетке; «Переделать» открывает выбор компонента.
7. Статистика: процент и подпись «X из Y запланированных дней» сходятся с ручным подсчётом; полоса и легенда показывают разбивку.
8. Календарь прокручен к сегодняшнему дню, листается влево; клетка дня изменения рецепта в рамке, тап показывает, что изменилось.
9. Серии: текущая подсвечена и подписана «– сейчас».
10. «Не получилось» перечисляет причины по датам, от новых к старым.
11. Переименование заметки привычки в файловом менеджере → открытый экран продолжает показывать привычку.
12. «Архивировать» закрывает экран, привычка пропадает из сетки, в заметке `archived: true`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add habit screen with stats, calendar and recipe editing"
```

---

### Task 12: Финальная проверка на телефоне и синке

**Files:** без изменений кода, если проверка не нашла проблем.

- [ ] **Step 1: Полный прогон**

Run: `npm test && npm run build`
Expected: все тесты PASS, сборка без ошибок.

- [ ] **Step 2: Проверка на Obsidian Mobile** (после того как obsidian-git синкнет `.obsidian/plugins/tiny-habits`)

1. Долгое нажатие по клетке открывает «Почему не получилось?», а короткий тап не открывает.
2. Свайп по сетке листает дни и не ставит отметки.
3. Празднование и конфетти видны поверх экрана и исчезают сами.
4. Экран привычки читается в одну колонку без горизонтального скролла страницы (скроллятся только календарь и сетка).

- [ ] **Step 3: Проверка синка**

Отметить день на одном ноутбуке, дождаться синка obsidian-git на другом. Открытая сетка на втором обновилась без перезапуска.

- [ ] **Step 4: Исправить найденное**

Каждую найденную проблему сначала воспроизвести, затем исправить по TDD, если она в домене или кодеке, или вручную с повторной проверкой, если она в UI. Закоммитить отдельным коммитом с описанием проблемы.
