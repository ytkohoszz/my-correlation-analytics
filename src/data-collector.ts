import { App } from "obsidian";
import { DailyRecord } from "./types";

const DIARY_FOLDER = "Ежедневник";

function parseNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseScore(v: unknown): number | null {
  const n = parseNum(v);
  return n !== null && n >= 1 && n <= 10 ? n : null;
}

function parseBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function parseTimeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^\d{1,2}[:.]\d{2}$/.test(s) ? s.replace(".", ":") : null;
}

export function collectDailyRecords(app: App): DailyRecord[] {
  const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(DIARY_FOLDER + "/"));
  const recordsMap = new Map<string, DailyRecord>();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter || {}) as Record<string, unknown>;

    const rawDate = String(fm["дата"] || file.basename).trim();
    const match = rawDate.match(/^\d{4}-\d{2}-\d{2}/);
    if (!match) continue;

    const dateISO = match[0]!;

    recordsMap.set(dateISO, {
      dateISO,
      score: parseScore(fm["оценка_дня"]),
      energy: parseScore(fm["энергия"]),
      sleepHours: parseNum(fm["сон_часов"]),
      calories: parseNum(fm["калории_ккал"]),
      weight: parseNum(fm["вес_кг"]),
      pagesRead: parseNum(fm["страниц_прочитано"]),
      screenHours: parseNum(fm["экран_часов"]),
      steps: parseNum(fm["шаги"]),
      bedtime: parseTimeStr(fm["отбой"]),
      wakeup: parseTimeStr(fm["подъём"]),
      habits: {
        nofap: parseBool(fm["nofap"]),
        тренировка: parseBool(fm["тренировка"]),
        чтение: parseBool(fm["чтение"]),
        режим_сна: parseBool(fm["режим_сна"]),
        диета: parseBool(fm["диета"]),
        без_соцсетей: parseBool(fm["без_соцсетей"])
      }
    });
  }

  return Array.from(recordsMap.values());
}