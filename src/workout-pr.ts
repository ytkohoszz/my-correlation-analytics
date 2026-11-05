import { App, TFile, normalizePath } from "obsidian";
import {
  ExerciseLoadType,
  ExerciseVariantSpec,
  PRDayEntry,
  PRMetricCriterion,
  PRRecordEvent,
} from "./types";

const MIN_VALID_DATE_ISO = "2000-01-01";

const SET_LINE_REGEX =
  /-\s*\(упражнение::\s*([^)]+)\)\s*\((повторы|секунды)::\s*(\d+(?:[.,]\d+)?)\)\s*(?:\(доп_вес_кг::\s*([^)]*)\)\s*)?(?:\(вариант::\s*([^)]*)\))?/;

export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isEmptyVal(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function parseWeightNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^\+/, "").replace(/\s*кг$/i, "").replace(",", ".");
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

/**
 * Единая функция нормализации варианта упражнения (идентична функции в health.js):
 * формирует ключ `название|вариант|тип_нагрузки|вес_кг`.
 * Различает:
 * - "bw" (свой вес, доп_вес_кг === 0)
 * - "weighted" (доп. вес > 0, округление до 0.01)
 * - "unspec" (пустое значение — не приравнивается к 0)
 */
export function buildExerciseVariantSpec(
  rawName: unknown,
  rawVariant: unknown,
  rawWeight: unknown
): ExerciseVariantSpec | null {
  const cleanName = cleanText(rawName);
  if (!cleanName) return null;
  const cleanVariant = cleanText(rawVariant) || "Основной";

  let loadType: ExerciseLoadType = "unspec";
  let weightVal: number | null = null;

  if (!isEmptyVal(rawWeight)) {
    const parsedW = parseWeightNumber(rawWeight);
    if (parsedW === null || parsedW < 0) return null;
    const normW = r2(parsedW);
    if (normW === 0) {
      loadType = "bw";
      weightVal = 0;
    } else {
      loadType = "weighted";
      weightVal = normW;
    }
  }

  const weightToken = loadType === "weighted" ? String(weightVal) : loadType;
  const key = `${cleanName}|${cleanVariant}|${loadType}|${weightToken}`;
  const loadSortOrder = loadType === "bw" ? 0 : loadType === "weighted" ? 1 : 2;

  return {
    key,
    name: cleanName,
    variant: cleanVariant,
    loadType,
    weight: weightVal,
    loadSortOrder,
  };
}

export function formatExerciseVariantLabel(
  name: string,
  variant: string,
  loadType: ExerciseLoadType,
  weight: number | null
): string {
  const varPart = variant && variant !== "Основной" ? ` (${variant})` : "";
  if (loadType === "bw") return `${name}${varPart} (свой вес)`;
  if (loadType === "weighted" && weight !== null) {
    return `${name}${varPart} (+${r2(weight).toLocaleString("ru-RU")} кг)`;
  }
  return `${name}${varPart} (вес не указан)`;
}

interface ParsedSetItem {
  spec: ExerciseVariantSpec;
  unit: "повт." | "с";
  value: number;
}

interface WorkoutSessionParsed {
  file: TFile;
  path: string;
  dateISO: string;
  startOrderMs: number;
  title: string;
  sets: ParsedSetItem[];
}

function todayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractValidISODate(raw: unknown, maxDateISO: string): string {
  const s = cleanText(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  if (s < MIN_VALID_DATE_ISO || s > maxDateISO) return "";
  return s;
}

function parseStartOffsetMs(startStr: string): number {
  if (!/^\d{2}:\d{2}$/.test(startStr)) return 0;
  const hh = Number(startStr.slice(0, 2));
  const mm = Number(startStr.slice(3, 5));
  if (
    Number.isInteger(hh) &&
    hh >= 0 &&
    hh <= 23 &&
    Number.isInteger(mm) &&
    mm >= 0 &&
    mm <= 59
  ) {
    return (hh * 60 + mm) * 60000;
  }
  return 0;
}

function parseSetsFromWorkoutText(content: string): ParsedSetItem[] {
  const out: ParsedSetItem[] = [];
  if (!content) return out;

  for (const line of content.split(/\r?\n/)) {
    const m = line.match(SET_LINE_REGEX);
    if (!m) continue;
    const name = cleanText(m[1]);
    const fieldRaw = cleanText(m[2]);
    const unit: "повт." | "с" = fieldRaw === "секунды" ? "с" : "повт.";
    const valStr = cleanText(m[3]).replace(",", ".");
    const val = Number(valStr);
    if (!name || !Number.isFinite(val) || val <= 0) continue;

    const spec = buildExerciseVariantSpec(name, m[5], m[4]);
    if (!spec) continue;

    out.push({ spec, unit, value: r2(val) });
  }
  return out;
}

export interface WorkoutHistoryScanResult {
  prDaysByDate: Map<string, PRDayEntry>;
  workoutDatesSet: Set<string>;
}

/**
 * Сканирует все файлы тренировок в хронологическом порядке (от старых к новым).
 * Первый день появления варианта упражнения фиксируется как стартовая точка (baseline)
 * и НЕ считается рекордом. Рекорд засчитывается только при строгом превышении прошлого максимума.
 */
export async function detectWorkoutPRDays(
  app: App,
  workoutsFolder: string = "Знания",
  criterion: PRMetricCriterion = "max_reps"
): Promise<WorkoutHistoryScanResult> {
  const folderPrefix =
    normalizePath(workoutsFolder || "Знания").replace(/\/+$/, "") + "/";
  const maxDateISO = todayLocalISO();

  const candidateFiles: Array<{
    file: TFile;
    dateISO: string;
    startStr: string;
    title: string;
  }> = [];

  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(folderPrefix)) continue;
    const cache = app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

    const isWorkoutByFm = cleanText(fm["тип"]) === "Тренировка";
    const isWorkoutByName = /^Тренировка\s+\d{4}-\d{2}-\d{2}$/i.test(file.basename);
    if (!isWorkoutByFm && !isWorkoutByName) continue;

    const nameDate = file.basename.replace(/^Тренировка\s+/i, "");
    const dateISO =
      extractValidISODate(fm["дата"], maxDateISO) ||
      extractValidISODate(nameDate, maxDateISO);
    if (!dateISO) continue;

    const startStr = cleanText(fm["начало"]);
    const title = cleanText(fm["название_тренировки"]) || file.basename;
    candidateFiles.push({ file, dateISO, startStr, title });
  }

  const parsedSessions: WorkoutSessionParsed[] = [];
  for (const item of candidateFiles) {
    let content = "";
    try {
      content = await app.vault.cachedRead(item.file);
    } catch {
      continue;
    }
    const sets = parseSetsFromWorkoutText(content);
    if (sets.length === 0) continue;

    const parts = item.dateISO.split("-").map(Number);
    const baseMs = Date.UTC(parts[0] ?? 2000, (parts[1] ?? 1) - 1, parts[2] ?? 1);
    parsedSessions.push({
      file: item.file,
      path: item.file.path,
      dateISO: item.dateISO,
      startOrderMs: baseMs + parseStartOffsetMs(item.startStr),
      title: item.title,
      sets,
    });
  }

  // Строгая хронологическая сортировка от самой первой тренировки к последней
  parsedSessions.sort(
    (a, b) =>
      a.startOrderMs - b.startOrderMs ||
      a.dateISO.localeCompare(b.dateISO) ||
      a.path.localeCompare(b.path, "ru")
  );

  // Группируем по дате (если в один день было две сессии, агрегируем по дню)
  const sessionsByDate = new Map<string, WorkoutSessionParsed[]>();
  for (const sess of parsedSessions) {
    const list = sessionsByDate.get(sess.dateISO) ?? [];
    list.push(sess);
    sessionsByDate.set(sess.dateISO, list);
  }

  const workoutDatesSet = new Set<string>(sessionsByDate.keys());
  const prDaysByDate = new Map<string, PRDayEntry>();

  // Исторические максимумы по ключу варианта `название|вариант|тип_нагрузки|вес_кг`
  const bestRepsByVariant = new Map<string, number>();
  const bestVolumeByVariant = new Map<string, number>();
  // Исторический максимум доп. веса по ключу `название|вариант`
  const bestWeightByExercise = new Map<string, number>();

  const sortedDatesAsc = Array.from(sessionsByDate.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  for (const dateISO of sortedDatesAsc) {
    const daySessions = sessionsByDate.get(dateISO) ?? [];
    const primarySession = daySessions[daySessions.length - 1];
    if (!primarySession) continue;

    // Сводка всех подходов дня по вариантам упражнений
    const dayVariantGroups = new Map<
      string,
      {
        spec: ExerciseVariantSpec;
        unit: "повт." | "с";
        values: number[];
      }
    >();

    // Максимальный вес за этот день по `название|вариант`
    const dayMaxWeightByEx = new Map<
      string,
      {
        spec: ExerciseVariantSpec;
        unit: "повт." | "с";
        maxWeight: number;
        bestRepsAtMaxWeight: number;
      }
    >();

    for (const sess of daySessions) {
      for (const s of sess.sets) {
        let grp = dayVariantGroups.get(s.spec.key);
        if (!grp) {
          grp = { spec: s.spec, unit: s.unit, values: [] };
          dayVariantGroups.set(s.spec.key, grp);
        }
        grp.values.push(s.value);

        if (s.spec.loadType === "weighted" && s.spec.weight !== null && s.spec.weight > 0) {
          const exKey = `${s.spec.name}|${s.spec.variant}`;
          const prevW = dayMaxWeightByEx.get(exKey);
          if (!prevW || s.spec.weight > prevW.maxWeight) {
            dayMaxWeightByEx.set(exKey, {
              spec: s.spec,
              unit: s.unit,
              maxWeight: s.spec.weight,
              bestRepsAtMaxWeight: s.value,
            });
          } else if (s.spec.weight === prevW.maxWeight && s.value > prevW.bestRepsAtMaxWeight) {
            prevW.bestRepsAtMaxWeight = s.value;
          }
        }
      }
    }

    const dayEvents: PRRecordEvent[] = [];

    // 1. Проверка рекорда по повторениям (max_reps) и объёму (total_volume) внутри точного веса
    for (const [varKey, grp] of dayVariantGroups.entries()) {
      const dayBestReps = Math.max(...grp.values);
      const dayTotalVol = r2(grp.values.reduce((acc, v) => acc + v, 0));
      const setsSummary = grp.values.map((v) => r2(v).toLocaleString("ru-RU")).join(" · ");

      const prevBestReps = bestRepsByVariant.get(varKey);
      const prevBestVol = bestVolumeByVariant.get(varKey);

      if (prevBestReps === undefined) {
        // Первое появление этого упражнения с этим весом в истории — стартовая точка (baseline), НЕ рекорд
        bestRepsByVariant.set(varKey, dayBestReps);
      } else {
        if (
          (criterion === "max_reps" || criterion === "any") &&
          dayBestReps > prevBestReps
        ) {
          dayEvents.push({
            variantKey: varKey,
            exerciseName: grp.spec.name,
            variant: grp.spec.variant,
            loadType: grp.spec.loadType,
            weight: grp.spec.weight,
            unit: grp.unit,
            criterionTriggered: "max_reps",
            newValue: dayBestReps,
            previousBest: prevBestReps,
            setsSummary,
          });
        }
        if (dayBestReps > prevBestReps) {
          bestRepsByVariant.set(varKey, dayBestReps);
        }
      }

      if (prevBestVol === undefined) {
        bestVolumeByVariant.set(varKey, dayTotalVol);
      } else {
        const alreadyAddedRepsPR = dayEvents.some(
          (e) => e.variantKey === varKey && e.criterionTriggered === "max_reps"
        );
        if (
          (criterion === "total_volume" || (criterion === "any" && !alreadyAddedRepsPR)) &&
          dayTotalVol > prevBestVol
        ) {
          dayEvents.push({
            variantKey: varKey,
            exerciseName: grp.spec.name,
            variant: grp.spec.variant,
            loadType: grp.spec.loadType,
            weight: grp.spec.weight,
            unit: grp.unit,
            criterionTriggered: "total_volume",
            newValue: dayTotalVol,
            previousBest: prevBestVol,
            setsSummary,
          });
        }
        if (dayTotalVol > prevBestVol) {
          bestVolumeByVariant.set(varKey, dayTotalVol);
        }
      }
    }

    // 2. Проверка рекорда по максимальному дополнительному весу (max_weight)
    for (const [exKey, wInfo] of dayMaxWeightByEx.entries()) {
      const prevMaxW = bestWeightByExercise.get(exKey);
      if (prevMaxW === undefined) {
        // Первая тренировка с доп. весом в этом упражнении — стартовая точка
        bestWeightByExercise.set(exKey, wInfo.maxWeight);
      } else {
        if (
          (criterion === "max_weight" || criterion === "any") &&
          wInfo.maxWeight > prevMaxW
        ) {
          dayEvents.push({
            variantKey: wInfo.spec.key,
            exerciseName: wInfo.spec.name,
            variant: wInfo.spec.variant,
            loadType: "weighted",
            weight: wInfo.maxWeight,
            unit: wInfo.unit,
            criterionTriggered: "max_weight",
            newValue: wInfo.maxWeight,
            previousBest: prevMaxW,
            setsSummary: `${wInfo.bestRepsAtMaxWeight} ${wInfo.unit}`,
          });
        }
        if (wInfo.maxWeight > prevMaxW) {
          bestWeightByExercise.set(exKey, wInfo.maxWeight);
        }
      }
    }

    if (dayEvents.length > 0) {
      prDaysByDate.set(dateISO, {
        dateISO,
        workoutPath: primarySession.path,
        workoutTitle: primarySession.title,
        events: dayEvents,
      });
    }
  }

  return { prDaysByDate, workoutDatesSet };
}

/**
 * Опциональная синхронизация флага `рекорд_тренировки` и списка `рекорды_упражнений`
 * в заметки ежедневника исключительно через app.fileManager.processFrontMatter.
 */
export async function syncPRFlagsToDiaryFrontmatter(
  app: App,
  diaryFolder: string,
  prDaysByDate: Map<string, PRDayEntry>
): Promise<number> {
  const folderPrefix =
    normalizePath(diaryFolder || "Ежедневник").replace(/\/+$/, "") + "/";
  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(folderPrefix));

  let updatedCount = 0;

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const rawDate = String(fm["дата"] ?? file.basename).trim();
    const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match || !match[1]) continue;

    const dateISO = match[1];
    const prEntry = prDaysByDate.get(dateISO);
    if (!prEntry) continue;

    const summaryList = prEntry.events.map((ev) => {
      const label = formatExerciseVariantLabel(
        ev.exerciseName,
        ev.variant,
        ev.loadType,
        ev.weight
      );
      if (ev.criterionTriggered === "max_weight") {
        return `${label}: новый вес +${ev.newValue} кг (было +${ev.previousBest} кг)`;
      }
      if (ev.criterionTriggered === "total_volume") {
        return `${label}: объём ${ev.newValue} ${ev.unit} (было ${ev.previousBest})`;
      }
      return `${label}: ${ev.newValue} ${ev.unit} (было ${ev.previousBest})`;
    });

    await app.fileManager.processFrontMatter(
      file,
      (frontmatter: Record<string, unknown>) => {
        frontmatter["дата"] = dateISO;
        frontmatter["рекорд_тренировки"] = true;
        frontmatter["рекорды_упражнений"] = summaryList;
      }
    );
    updatedCount++;
  }

  return updatedCount;
}
