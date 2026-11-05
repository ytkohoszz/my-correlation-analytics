import { App, normalizePath } from "obsidian";
import { DailyRecord } from "./types";

const DEFAULT_DIARY_FOLDER = "Ежедневник";
const SOCIAL_LIMIT_MIN = 30;
const MIN_VALID_DATE_ISO = "2000-01-01";

function todayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseNum(v: unknown, min?: number, max?: number): number | null {
  if (v === null || v === undefined) return null;
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) {
    n = v;
  } else if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (s !== "") {
      const parsed = Number(s);
      if (Number.isFinite(parsed)) n = parsed;
    }
  }
  if (n === null) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

function parseScore(v: unknown): number | null {
  return parseNum(v, 1, 10);
}

function parseBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function parseTimeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^\d{1,2}[:.]\d{2}$/.test(s) ? s.replace(".", ":") : null;
}

function parseSocialMinutes(v: unknown): number | null {
  const n = parseNum(v, 0, 1440);
  return n === null ? null : Math.round(n);
}

export function collectDailyRecords(
  app: App,
  diaryFolder: string = DEFAULT_DIARY_FOLDER
): DailyRecord[] {
  const folderPrefix =
    normalizePath(diaryFolder || DEFAULT_DIARY_FOLDER).replace(/\/+$/, "") + "/";
  const maxDateISO = todayLocalISO();

  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(folderPrefix));

  const recordsMap = new Map<string, { mtime: number; record: DailyRecord }>();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

    const rawDate = String(fm["дата"] ?? file.basename).trim();
    const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match || !match[1]) continue;

    const dateISO = match[1];
    if (dateISO < MIN_VALID_DATE_ISO || dateISO > maxDateISO) continue;

    const prev = recordsMap.get(dateISO);
    if (prev && file.stat.mtime <= prev.mtime) continue;

    const socialMinutes = parseSocialMinutes(fm["соцсети_мин"]);

    let noSocials = parseBool(fm["без_соцсетей"]);
    if (noSocials === null && socialMinutes !== null) {
      noSocials = socialMinutes <= SOCIAL_LIMIT_MIN;
    }

    recordsMap.set(dateISO, {
      mtime: file.stat.mtime,
      record: {
        dateISO,
        score: parseScore(fm["оценка_дня"]),
        energy: parseScore(fm["энергия"]),
        sleepHours: parseNum(fm["сон_часов"], 0, 24),
        calories: parseNum(fm["калории_ккал"], 1, 15000),
        protein: parseNum(fm["белки_г"], 0, 1000),
        fats: parseNum(fm["жиры_г"], 0, 1000),
        carbs: parseNum(fm["углеводы_г"], 0, 2000),
        weight: parseNum(fm["вес_кг"], 20, 300),
        pagesRead: parseNum(fm["страниц_прочитано"], 0, 5000),
        screenHours: parseNum(fm["экран_часов"], 0, 24),
        steps: parseNum(fm["шаги"], 0, 200000),
        focusHours: parseNum(fm["глубокая_работа_часов"], 0, 24),
        socialMinutes,
        bedtime: parseTimeStr(fm["отбой"]),
        wakeup: parseTimeStr(fm["подъём"]),
        habits: {
          nofap: parseBool(fm["nofap"]),
          тренировка: parseBool(fm["тренировка"]),
          чтение: parseBool(fm["чтение"]),
          режим_сна: parseBool(fm["режим_сна"]),
          диета: parseBool(fm["диета"]),
          без_соцсетей: noSocials,
        },
      },
    });
  }

  return Array.from(recordsMap.values()).map((x) => x.record);
}
