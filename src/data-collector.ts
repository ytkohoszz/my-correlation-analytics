import { App, normalizePath } from "obsidian";
import { DailyRecord, DEFAULT_SETTINGS, WorkoutDayMetrics } from "./types";

const DEFAULT_DIARY_FOLDER = DEFAULT_SETTINGS.diaryFolder;
const DEFAULT_SOCIAL_LIMIT_MIN = DEFAULT_SETTINGS.socialLimitMin;
const DEFAULT_VALUES_COMPASS_PATH = DEFAULT_SETTINGS.valuesCompassPath;
const DEFAULT_READING_LOG_PATH = DEFAULT_SETTINGS.readingLogPath;
const MIN_VALID_DATE_ISO = "2000-01-01";

export interface ValuesCompassDayData {
  actionsCount: number;
  hasSavoring: boolean;
}

export interface ValuesCompassDailyIndex {
  minDateISO: string | null;
  byDate: Map<string, ValuesCompassDayData>;
}

export type FocusFallbackIndex = Map<string, number>;

export interface CollectDailyRecordsOptions {
  socialLimitMin?: number;
  valuesIndex?: ValuesCompassDailyIndex | null;
  readingLogIndex?: ReadingLogIndex | null;
  focusFallbackIndex?: FocusFallbackIndex | null;
  workoutDatesSet?: Set<string> | null;
  workoutMetricsByDate?: Map<string, WorkoutDayMetrics> | null;
}

function extractValidDateISO(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m || !m[1]) return null;
  return m[1] >= MIN_VALID_DATE_ISO ? m[1] : null;
}

export async function readValuesCompassIndex(
  app: App,
  filePath: string = DEFAULT_VALUES_COMPASS_PATH
): Promise<ValuesCompassDailyIndex> {
  const byDate = new Map<string, ValuesCompassDayData>();
  let minDateISO: string | null = null;

  const normalized = normalizePath(filePath || DEFAULT_VALUES_COMPASS_PATH);
  try {
    const exists = await app.vault.adapter.exists(normalized);
    if (!exists) return { minDateISO, byDate };

    const rawText = await app.vault.adapter.read(normalized);
    const parsed = JSON.parse(rawText) as {
      logs?: Array<{ date?: unknown }>;
      savoring?: Array<{ date?: unknown }>;
    };

    const touchDate = (dateISO: string): ValuesCompassDayData => {
      if (minDateISO === null || dateISO < minDateISO) {
        minDateISO = dateISO;
      }
      let entry = byDate.get(dateISO);
      if (!entry) {
        entry = { actionsCount: 0, hasSavoring: false };
        byDate.set(dateISO, entry);
      }
      return entry;
    };

    if (Array.isArray(parsed?.logs)) {
      for (const item of parsed.logs) {
        const d = extractValidDateISO(item?.date);
        if (!d) continue;
        touchDate(d).actionsCount += 1;
      }
    }

    if (Array.isArray(parsed?.savoring)) {
      for (const item of parsed.savoring) {
        const d = extractValidDateISO(item?.date);
        if (!d) continue;
        touchDate(d).hasSavoring = true;
      }
    }
  } catch (err) {
    console.warn("[my-correlation-analytics] Не удалось прочитать values-compass.json:", err);
  }

  return { minDateISO, byDate };
}

function extractPagesValue(entry: unknown): number | null {
  if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) {
    return entry;
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    for (const key of ["pages", "pagesRead", "totalPages", "delta", "страниц"]) {
      const val = parseNum(obj[key], 0, 5000);
      if (val !== null) return val;
    }
  }
  return null;
}

export type ReadingLogIndex = Map<string, number>;

export async function readReadingLogIndex(
  app: App,
  filePath: string = DEFAULT_READING_LOG_PATH
): Promise<ReadingLogIndex> {
  const byDate = new Map<string, number>();
  const normalized = normalizePath(filePath || DEFAULT_READING_LOG_PATH);

  try {
    const exists = await app.vault.adapter.exists(normalized);
    if (!exists) return byDate;

    const rawText = await app.vault.adapter.read(normalized);
    const parsed: unknown = JSON.parse(rawText);

    const addPages = (dateRaw: unknown, pages: number | null, accumulate: boolean) => {
      const dateISO = extractValidDateISO(dateRaw);
      if (!dateISO || pages === null) return;
      const prev = byDate.get(dateISO) ?? 0;
      byDate.set(dateISO, accumulate ? prev + pages : Math.max(prev, pages));
    };

    const ingestArray = (arr: unknown[]) => {
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        addPages(obj["date"] ?? obj["dateISO"] ?? obj["дата"], extractPagesValue(obj), true);
      }
    };

    const ingestRecordMap = (rec: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(rec)) {
        addPages(k, extractPagesValue(v), false);
      }
    };

    if (Array.isArray(parsed)) {
      ingestArray(parsed);
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj["entries"])) ingestArray(obj["entries"]);
      else if (Array.isArray(obj["logs"])) ingestArray(obj["logs"]);
      else if (obj["days"] && typeof obj["days"] === "object" && !Array.isArray(obj["days"])) {
        ingestRecordMap(obj["days"] as Record<string, unknown>);
      } else if (obj["byDate"] && typeof obj["byDate"] === "object" && !Array.isArray(obj["byDate"])) {
        ingestRecordMap(obj["byDate"] as Record<string, unknown>);
      } else {
        ingestRecordMap(obj);
      }
    }
  } catch (err) {
    console.warn("[my-correlation-analytics] Не удалось прочитать reading-log.json:", err);
  }

  return byDate;
}

function parseFocusMinutesFromBody(content: string): number | null {
  if (!content) return null;
  const headingMatch = content.match(/^##\s+Фокус\b[^\r\n]*/im);
  if (!headingMatch || headingMatch.index === undefined) return null;

  const afterHeading = content.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingMatch = afterHeading.match(/\r?\n##\s+/);
  const sectionText =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? afterHeading.slice(0, nextHeadingMatch.index)
      : afterHeading;

  const durRegex = /\(длительность_мин::\s*(\d+(?:[.,]\d+)?)\)/g;
  let totalMin = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = durRegex.exec(sectionText)) !== null) {
    const val = Number((m[1] ?? "").replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val <= 1440) {
      totalMin += val;
      count += 1;
    }
  }

  return count > 0 ? totalMin : null;
}

export async function readFocusSectionFallbackIndex(
  app: App,
  diaryFolder: string = DEFAULT_DIARY_FOLDER
): Promise<FocusFallbackIndex> {
  const folderPrefix =
    normalizePath(diaryFolder || DEFAULT_DIARY_FOLDER).replace(/\/+$/, "") + "/";
  const maxDateISO = todayLocalISO();

  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(folderPrefix));

  const byDateMtime = new Map<string, { mtime: number; hours: number }>();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

    const rawDate = String(fm["дата"] ?? file.basename).trim();
    const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match || !match[1]) continue;

    const dateISO = match[1];
    if (dateISO < MIN_VALID_DATE_ISO || dateISO > maxDateISO) continue;

    const existingFmFocus = parseFocusHours(fm);
    if (existingFmFocus !== null && existingFmFocus > 0) continue;

    const prev = byDateMtime.get(dateISO);
    if (prev && file.stat.mtime <= prev.mtime) continue;

    let content = "";
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      continue;
    }

    const totalMin = parseFocusMinutesFromBody(content);
    if (totalMin !== null && totalMin > 0) {
      const hours = Math.round((totalMin / 60) * 100) / 100;
      byDateMtime.set(dateISO, { mtime: file.stat.mtime, hours });
    }
  }

  const result: FocusFallbackIndex = new Map<string, number>();
  for (const [dateISO, entry] of byDateMtime.entries()) {
    result.set(dateISO, entry.hours);
  }
  return result;
}

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

function parseTimeToHours(
  timeStr: string | null,
  shiftBeforeNoon: boolean
): number | null {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !m[1] || !m[2]) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  if (shiftBeforeNoon && hh < 12) {
    hh += 24;
  }
  return Math.round((hh + mm / 60) * 100) / 100;
}

function parseFocusHours(fm: Record<string, unknown>): number | null {
  const focusMin = parseNum(fm["глубокая_работа_мин"], 0, 1440);
  if (focusMin !== null) {
    return Math.round((focusMin / 60) * 100) / 100;
  }

  const focusHoursRaw = parseNum(fm["глубокая_работа_часов"], 0, 24);
  if (focusHoursRaw !== null) {
    return focusHoursRaw;
  }

  const byGoals = fm["фокус_по_целям"];
  if (byGoals && typeof byGoals === "object" && !Array.isArray(byGoals)) {
    let totalMin = 0;
    let validCount = 0;
    for (const v of Object.values(byGoals as Record<string, unknown>)) {
      const m = parseNum(v, 0, 1440);
      if (m !== null) {
        totalMin += m;
        validCount += 1;
      }
    }
    if (validCount > 0) {
      return Math.round((totalMin / 60) * 100) / 100;
    }
  }

  return null;
}

function parseDayGoalsStats(fm: Record<string, unknown>): {
  dayProgressPct: number | null;
  dayGoalsCount: number | null;
} {
  const rawGoals = fm["цели_дня"];
  const goalsArr = Array.isArray(rawGoals) ? rawGoals : null;
  const dayGoalsCount = goalsArr ? goalsArr.length : null;

  let dayProgressPct = parseNum(fm["прогресс_дня_процент"], 0, 100);
  if (dayProgressPct === null && goalsArr && goalsArr.length > 0) {
    const vals: number[] = [];
    for (const item of goalsArr) {
      if (!item || typeof item !== "object") continue;
      const p = parseNum((item as Record<string, unknown>)["progress"], 0, 100);
      if (p !== null) vals.push(p);
    }
    if (vals.length > 0) {
      dayProgressPct =
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
  }

  return { dayProgressPct, dayGoalsCount };
}

export function collectDailyRecords(
  app: App,
  diaryFolder: string = DEFAULT_DIARY_FOLDER,
  options: CollectDailyRecordsOptions = {}
): DailyRecord[] {
  const folderPrefix =
    normalizePath(diaryFolder || DEFAULT_DIARY_FOLDER).replace(/\/+$/, "") + "/";
  const socialLimitMin =
    typeof options.socialLimitMin === "number" &&
    Number.isFinite(options.socialLimitMin) &&
    options.socialLimitMin >= 0
      ? options.socialLimitMin
      : DEFAULT_SOCIAL_LIMIT_MIN;
  const valuesIndex = options.valuesIndex ?? null;
  const readingLogIndex = options.readingLogIndex ?? null;
  const focusFallbackIndex = options.focusFallbackIndex ?? null;
  const workoutDatesSet = options.workoutDatesSet ?? null;
  const workoutMetricsByDate = options.workoutMetricsByDate ?? null;
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
      noSocials = socialMinutes <= socialLimitMin;
    }

    let valuesActionsCount: number | null = null;
    let hasSavoring: boolean | null = null;
    if (
      valuesIndex &&
      valuesIndex.minDateISO !== null &&
      dateISO >= valuesIndex.minDateISO
    ) {
      const vDay = valuesIndex.byDate.get(dateISO);
      valuesActionsCount = vDay ? vDay.actionsCount : 0;
      hasSavoring = vDay ? vDay.hasSavoring : false;
    }

    const calories = parseNum(fm["калории_ккал"], 1, 15000);
    const macroMin = calories !== null ? 0 : 0.1;

    let pagesRead = parseNum(fm["страниц_прочитано"], 0, 5000);
    const loggedPages = readingLogIndex?.get(dateISO);
    if ((pagesRead === null || pagesRead === 0) && loggedPages !== undefined && loggedPages > 0) {
      pagesRead = loggedPages;
    }

    let readingHabit = parseBool(fm["чтение"]);
    if (readingHabit === null && pagesRead !== null && pagesRead > 0) {
      readingHabit = true;
    }

    let focusHours = parseFocusHours(fm);
    const fallbackFocusHours = focusFallbackIndex?.get(dateISO);
    if (
      (focusHours === null || focusHours === 0) &&
      fallbackFocusHours !== undefined &&
      fallbackFocusHours > 0
    ) {
      focusHours = fallbackFocusHours;
    }

    const bedtime = parseTimeStr(fm["отбой"]);
    const wakeup = parseTimeStr(fm["подъём"]);
    const { dayProgressPct, dayGoalsCount } = parseDayGoalsStats(fm);

    const workoutMetrics = workoutMetricsByDate?.get(dateISO) ?? null;
    const hasWorkoutFile = Boolean(workoutDatesSet?.has(dateISO) || workoutMetrics);
    let workoutHabit = parseBool(fm["тренировка"]);
    if (hasWorkoutFile) {
      workoutHabit = true;
    }

    recordsMap.set(dateISO, {
      mtime: file.stat.mtime,
      record: {
        dateISO,
        score: parseScore(fm["оценка_дня"]),
        energy: parseScore(fm["энергия"]),
        sleepHours: parseNum(fm["сон_часов"], 0.1, 24),
        calories,
        protein: parseNum(fm["белки_г"], macroMin, 1000),
        fats: parseNum(fm["жиры_г"], macroMin, 1000),
        carbs: parseNum(fm["углеводы_г"], macroMin, 2000),
        weight: parseNum(fm["вес_кг"], 20, 300),
        pagesRead,
        screenHours: parseNum(fm["экран_часов"], 0.01, 24),
        steps: parseNum(fm["шаги"], 1, 200000),
        focusHours,
        socialMinutes,
        valuesActionsCount,
        dayProgressPct,
        dayGoalsCount,
        srCardsReviewed: parseNum(fm["карточек_пройдено"], 0, 10000),
        grammarExercises: parseNum(fm["грамматика_упражнений"], 0, 5000),
        bedtimeHour: parseTimeToHours(bedtime, true),
        wakeupHour: parseTimeToHours(wakeup, false),
        workoutDurationMin: workoutMetrics ? workoutMetrics.durationMin : null,
        workoutSetsCount:
          workoutMetrics && workoutMetrics.setsCount > 0
            ? workoutMetrics.setsCount
            : null,
        workoutTotalReps:
          workoutMetrics && workoutMetrics.totalReps > 0
            ? workoutMetrics.totalReps
            : null,
        workoutTonnageKg:
          workoutMetrics && workoutMetrics.tonnageKg > 0
            ? workoutMetrics.tonnageKg
            : null,
        bedtime,
        wakeup,
        habits: {
          nofap: parseBool(fm["nofap"]),
          тренировка: workoutHabit,
          чтение: readingHabit,
          режим_сна: parseBool(fm["режим_сна"]),
          диета: parseBool(fm["диета"]),
          без_соцсетей: noSocials,
          момент_присутствия: hasSavoring,
        },
      },
    });
  }

  return Array.from(recordsMap.values()).map((x) => x.record);
}
