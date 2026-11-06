// src/engine.ts
import {
  DailyRecord,
  MetricCorrelation,
  HabitImpact,
  AnalyticsReport,
  ScatterPoint,
  LagImpact,
  SocialLimitInsight,
  SocialStats,
  RecordDaysReport,
  RecordDayMetricRow,
  MetricGroup,
  WhitelistPairSpec,
} from "./types";

export const SOCIAL_LIMIT_MIN = 30;
export const MIN_PAIR_SAMPLE = 14;
export const MIN_BINARY_GROUP_SAMPLE = 3;
export const MIN_VARIANCE_EPS = 1e-4;
export const MIN_SIGNIFICANT_R = 0.3;
export const MIN_SIGNIFICANT_DELTA = 0.4;
export const DEFAULT_VISIBLE_CORRELATIONS = 6;

const MIN_SAMPLE = 4;
const MIN_GROUP_DAYS = 3;

export const METRIC_GROUPS: Record<string, MetricGroup> = {
  calories: "nutrition",
  protein: "nutrition",
  fats: "nutrition",
  carbs: "nutrition",
  диета: "nutrition",
  weight: "body",
  sleepHours: "sleep",
  режим_сна: "sleep",
  score: "wellbeing",
  energy: "wellbeing",
  тренировка: "activity",
  steps: "activity",
  focusHours: "focus",
  socialMinutes: "digital",
  screenHours: "digital",
  без_соцсетей: "digital",
  pagesRead: "reading",
  чтение: "reading",
  nofap: "discipline",
};

/**
 * Белый список осмысленных пар показателей.
 * Пары внутри одной группы (например, БЖУ ↔ калории) или между несвязанными доменами (питание ↔ чтение) исключены структурно.
 */
export const WHITELISTED_METRIC_PAIRS: readonly WhitelistPairSpec[] = [
  {
    id: "protein_weight_lag1",
    leftKey: "protein",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Белки (г)",
    rightKey: "weight",
    rightGroup: "body",
    rightLabel: "Вес (кг)",
    rightUnit: "кг",
    direction: "→",
    lagDays: 1,
    label: "Белки → Вес (+1 дн.)",
    // Лаг 1 день отражает утреннее взвешивание после рациона предыдущего дня
    rationale: "Влияние белкового рациона на массу тела с лагом 1 день",
  },
  {
    id: "calories_weight_lag1",
    leftKey: "calories",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Калории (ккал)",
    rightKey: "weight",
    rightGroup: "body",
    rightLabel: "Вес (кг)",
    rightUnit: "кг",
    direction: "→",
    lagDays: 1,
    label: "Калории → Вес (+1 дн.)",
    // Калорийность дня отражается на утреннем весе следующего дня (гликоген, вода и баланс массы)
    rationale: "Влияние суточной калорийности на утренний вес следующего дня",
  },
  {
    id: "protein_weight_sync",
    leftKey: "protein",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Белки (г)",
    rightKey: "weight",
    rightGroup: "body",
    rightLabel: "Вес (кг)",
    rightUnit: "кг",
    direction: "↔",
    lagDays: 0,
    label: "Белки ↔ Вес",
    // Синхронный срез показывает общую сопряжённость фазы профицита белка и динамики массы тела
    rationale: "Сопряжённость потребления белка и текущей массы тела в рамках периода",
  },
  {
    id: "calories_weight_sync",
    leftKey: "calories",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Калории (ккал)",
    rightKey: "weight",
    rightGroup: "body",
    rightLabel: "Вес (кг)",
    rightUnit: "кг",
    direction: "↔",
    lagDays: 0,
    label: "Калории ↔ Вес",
    // Синхронная проверка связи текущего калоража и массы тела на выбранном интервале
    rationale: "Сопряжённость калорийности рациона и массы тела в рамках периода",
  },
  {
    id: "sleep_regime_score",
    leftKey: "режим_сна",
    leftType: "habit",
    leftGroup: "sleep",
    leftLabel: "Режим сна",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Режим сна → Оценка дня",
    // Соблюдение графика отбоя и подъёма стабилизирует циркадный ритм и субъективное качество дня
    rationale: "Стабильный график сна улучшает когнитивный тонус и оценку дня",
  },
  {
    id: "sleep_regime_energy",
    leftKey: "режим_сна",
    leftType: "habit",
    leftGroup: "sleep",
    leftLabel: "Режим сна",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Режим сна → Энергия",
    // Фиксированный режим сна напрямую определяет утреннюю бодрость и уровень энергии
    rationale: "Регулярный режим сна напрямую влияет на дневной уровень энергии",
  },
  {
    id: "sleep_hours_energy",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → Энергия",
    // Продолжительность ночного восстановления определяет физиологический ресурс бодрствования
    rationale: "Объём ночного сна определяет доступный физиологический ресурс энергии",
  },
  {
    id: "sleep_hours_score",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → Оценка дня",
    // Достаточная продолжительность сна снижает утомляемость и повышает итоговую оценку дня
    rationale: "Достаточный объём сна поддерживает эмоциональный фон и продуктивность дня",
  },
  {
    id: "workout_energy",
    leftKey: "тренировка",
    leftType: "habit",
    leftGroup: "activity",
    leftLabel: "Тренировка",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Тренировка → Энергия",
    // Силовая нагрузка меняет общий нейромышечный тонус и субъективную бодрость в течение дня
    rationale: "Связь тренировочной нагрузки с дневным уровнем энергии",
  },
  {
    id: "workout_score",
    leftKey: "тренировка",
    leftType: "habit",
    leftGroup: "activity",
    leftLabel: "Тренировка",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Тренировка → Оценка дня",
    // Выполнение силовой тренировки повышает удовлетворённость днём через достижение целевой нагрузки
    rationale: "Выполнение тренировки повышает субъективную удовлетворённость днём",
  },
  {
    id: "focus_score",
    leftKey: "focusHours",
    leftType: "numeric",
    leftGroup: "focus",
    leftLabel: "Глубокая работа (ч)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Глубокая работа → Оценка дня",
    // Количество часов сфокусированной работы является главным фактором продуктивного дня
    rationale: "Объём глубокого фокуса определяет результативность и оценку дня",
  },
  {
    id: "social_score",
    leftKey: "socialMinutes",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Скроллинг соцсетей (мин)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Скроллинг соцсетей → Оценка дня",
    // Избыточное время в соцсетях фрагментирует внимание и снижает удовлетворённость днём
    rationale: "Потеря времени на скроллинг вытесняет целевые задачи и снижает оценку дня",
  },
  {
    id: "social_focus",
    leftKey: "socialMinutes",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Скроллинг соцсетей (мин)",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Скроллинг соцсетей → Глубокая работа",
    // Прямая конкуренция экранного скроллинга и глубокой концентрации за бюджет внимания
    rationale: "Экранный скроллинг напрямую конкурирует со временем глубокой концентрации",
  },
  {
    id: "steps_energy",
    leftKey: "steps",
    leftType: "numeric",
    leftGroup: "activity",
    leftLabel: "Шаги",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "↔",
    lagDays: 0,
    label: "Шаги ↔ Энергия",
    // Базовая локомоторная активность и общий дневной тонус взаимно поддерживают друг друга
    rationale: "Взаимная сопряжённость фоновой двигательной активности и дневного тонуса",
  },
];

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let sumSq = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i]! - mean;
    sumSq += d * d;
  }
  return sumSq / (xs.length - 1);
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < MIN_SAMPLE) return null;
  if (variance(xs) < MIN_VARIANCE_EPS || variance(ys) < MIN_VARIANCE_EPS) {
    return null;
  }
  const n = xs.length;

  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
  }

  const denom = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );
  if (denom === 0 || !Number.isFinite(denom)) return null;

  const r = (n * sumXY - sumX * sumY) / denom;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}

function computeRanks(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(vals.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) {
      j++;
    }
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < MIN_SAMPLE) return null;
  if (variance(xs) < MIN_VARIANCE_EPS || variance(ys) < MIN_VARIANCE_EPS) {
    return null;
  }
  const rX = computeRanks(xs);
  const rY = computeRanks(ys);
  return pearsonCorrelation(rX, rY);
}

function classifyRStrength(r: number): string {
  const absR = Math.abs(r);
  if (absR >= 0.65) return "сильная";
  if (absR >= 0.45) return "умеренная";
  return "слабая";
}

function classifyDeltaStrength(delta: number, unit: string): string {
  const absD = Math.abs(delta);
  if (unit === "балла") {
    if (absD >= 1.2) return "сильная";
    if (absD >= 0.7) return "умеренная";
    return "слабая";
  }
  if (absD >= 1.5) return "сильная";
  if (absD >= 0.8) return "умеренная";
  return "слабая";
}

const HABIT_NAMES: Record<string, string> = {
  nofap: "NoFap",
  тренировка: "Тренировка",
  чтение: "Чтение",
  режим_сна: "Режим сна",
  диета: "Диета",
  без_соцсетей: "Без соцсетей",
};

function parseDateMs(iso: string): number {
  const parts = iso.split("-").map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }
  return 0;
}

function addDaysISO(iso: string, days: number): string {
  if (days === 0) return iso;
  const ms = parseDateMs(iso);
  if (!ms) return "";
  const d = new Date(ms + days * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatNumRu(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("ru-RU");
}

function formatHoursDiffHuman(diffHours: number): string {
  const totalMin = Math.round(Math.abs(diffHours) * 60);
  if (totalMin < 60) {
    return `${totalMin} мин`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function buildHumanConclusion(
  key: string,
  label: string,
  unit: string,
  kind: "numeric" | "habit_pct",
  delta: number | null,
  lowSample: boolean
): string {
  if (delta === null) {
    return "Недостаточно записей для сравнения";
  }
  const prefix = lowSample ? "Мало данных (выборка < 3 дн.): " : "";

  if (kind === "habit_pct") {
    const absPct = Math.round(Math.abs(delta));
    if (absPct < 2) {
      return `${prefix}Выполняется примерно одинаково`;
    }
    if (key === "sleepDeprived") {
      return delta > 0
        ? `${prefix}В дни рекордов недосып бывает на ${absPct}% чаще`
        : `${prefix}В дни рекордов недосып бывает на ${absPct}% реже`;
    }
    return delta > 0
      ? `${prefix}В дни рекордов выполняется на ${absPct}% чаще`
      : `${prefix}В дни рекордов выполняется на ${absPct}% реже`;
  }

  const absVal = Math.abs(delta);
  if (
    (key === "sleepHours" && absVal < 0.08) ||
    (key === "focusHours" && absVal < 0.08) ||
    (key === "calories" && absVal < 15) ||
    (key === "steps" && absVal < 100) ||
    absVal < 0.05
  ) {
    return `${prefix}В дни рекордов и в остальные дни почти не отличается`;
  }

  if (key === "sleepHours") {
    const durText = formatHoursDiffHuman(delta);
    return delta > 0
      ? `${prefix}В дни рекордов сон в среднем на ${durText} дольше`
      : `${prefix}В дни рекордов сон в среднем на ${durText} короче`;
  }

  if (key === "focusHours") {
    const durText = formatHoursDiffHuman(delta);
    return delta > 0
      ? `${prefix}В дни рекордов глубокая работа в среднем на ${durText} дольше`
      : `${prefix}В дни рекордов глубокая работа в среднем на ${durText} меньше`;
  }

  const cleanUnit = unit === "/10" ? "балла" : unit;
  const word = delta > 0 ? "выше" : "ниже";
  return `${prefix}В дни рекордов ${label.toLowerCase()} в среднем на ${formatNumRu(absVal)} ${cleanUnit} ${word}`;
}

export interface AnalyzeOptions {
  recordDatesSet?: Set<string>;
  workoutDatesSet?: Set<string>;
}

/**
 * Сравнивает показатели в дни рекордов против всех остальных дней периода.
 */
export function analyzeRecordDaysComparisons(
  sliceRecords: DailyRecord[],
  recordDatesSet: Set<string>,
  workoutDatesSet: Set<string>
): RecordDaysReport {
  const recordDays: DailyRecord[] = [];
  const otherDays: DailyRecord[] = [];
  let totalWorkoutDaysInPeriod = 0;

  for (const r of sliceRecords) {
    if (workoutDatesSet.has(r.dateISO) || r.habits.тренировка === true) {
      totalWorkoutDaysInPeriod++;
    }
    if (recordDatesSet.has(r.dateISO)) {
      recordDays.push(r);
    } else {
      otherDays.push(r);
    }
  }

  const rows: RecordDayMetricRow[] = [];

  const addNumericRow = (
    key: string,
    label: string,
    unit: string,
    higherIsBetter: boolean,
    getter: (r: DailyRecord) => number | null
  ) => {
    const recVals: number[] = [];
    const othVals: number[] = [];

    for (const r of recordDays) {
      const v = getter(r);
      if (v !== null && Number.isFinite(v)) recVals.push(v);
    }
    for (const r of otherDays) {
      const v = getter(r);
      if (v !== null && Number.isFinite(v)) othVals.push(v);
    }

    if (recVals.length === 0 && othVals.length === 0) return;

    const avgRecordDays =
      recVals.length > 0
        ? round1(recVals.reduce((a, b) => a + b, 0) / recVals.length)
        : null;
    const avgOtherDays =
      othVals.length > 0
        ? round1(othVals.reduce((a, b) => a + b, 0) / othVals.length)
        : null;
    const delta =
      avgRecordDays !== null && avgOtherDays !== null
        ? round1(avgRecordDays - avgOtherDays)
        : null;
    const lowSample =
      recVals.length < MIN_GROUP_DAYS || othVals.length < MIN_GROUP_DAYS;

    rows.push({
      key,
      label,
      unit,
      kind: "numeric",
      higherIsBetter,
      avgRecordDays,
      avgOtherDays,
      delta,
      countRecordDays: recVals.length,
      countOtherDays: othVals.length,
      lowSample,
      conclusion: buildHumanConclusion(
        key,
        label,
        unit,
        "numeric",
        delta,
        lowSample
      ),
    });
  };

  const addBooleanRateRow = (
    key: string,
    label: string,
    higherIsBetter: boolean,
    getter: (r: DailyRecord) => boolean | null
  ) => {
    const recBools: boolean[] = [];
    const othBools: boolean[] = [];

    for (const r of recordDays) {
      const b = getter(r);
      if (typeof b === "boolean") recBools.push(b);
    }
    for (const r of otherDays) {
      const b = getter(r);
      if (typeof b === "boolean") othBools.push(b);
    }

    if (recBools.length === 0 && othBools.length === 0) return;

    const avgRecordDays =
      recBools.length > 0
        ? Math.round((recBools.filter(Boolean).length / recBools.length) * 100)
        : null;
    const avgOtherDays =
      othBools.length > 0
        ? Math.round((othBools.filter(Boolean).length / othBools.length) * 100)
        : null;
    const delta =
      avgRecordDays !== null && avgOtherDays !== null
        ? avgRecordDays - avgOtherDays
        : null;
    const lowSample =
      recBools.length < MIN_GROUP_DAYS || othBools.length < MIN_GROUP_DAYS;

    rows.push({
      key,
      label,
      unit: "%",
      kind: "habit_pct",
      higherIsBetter,
      avgRecordDays,
      avgOtherDays,
      delta,
      countRecordDays: recBools.length,
      countOtherDays: othBools.length,
      lowSample,
      conclusion: buildHumanConclusion(
        key,
        label,
        "%",
        "habit_pct",
        delta,
        lowSample
      ),
    });
  };

  addNumericRow("score", "Оценка дня", "/10", true, (r) => r.score);
  addNumericRow("energy", "Энергия", "/10", true, (r) => r.energy);
  addNumericRow("sleepHours", "Сон", "ч", true, (r) => r.sleepHours);
  addBooleanRateRow(
    "sleepDeprived",
    "Недосып (< 7 ч сна)",
    false,
    (r) => (r.sleepHours !== null ? r.sleepHours < 7 : null)
  );
  addNumericRow("calories", "Калории", "ккал", true, (r) => r.calories);
  addNumericRow("protein", "Белки", "г", true, (r) => r.protein);
  addNumericRow("fats", "Жиры", "г", true, (r) => r.fats);
  addNumericRow("carbs", "Углеводы", "г", true, (r) => r.carbs);
  addNumericRow("weight", "Вес тела", "кг", true, (r) => r.weight);
  addNumericRow("focusHours", "Глубокая работа", "ч", true, (r) => r.focusHours);
  addNumericRow("steps", "Шаги", "шаг", true, (r) => r.steps);
  addNumericRow("pagesRead", "Чтение", "стр", true, (r) => r.pagesRead);
  addNumericRow("socialMinutes", "Скроллинг соцсетей", "мин", false, (r) => r.socialMinutes);

  addBooleanRateRow("habit_nofap", "Привычка: NoFap", true, (r) => r.habits.nofap);
  addBooleanRateRow("habit_sleep", "Привычка: Режим сна", true, (r) => r.habits.режим_сна);
  addBooleanRateRow("habit_diet", "Привычка: Диета", true, (r) => r.habits.диета);
  addBooleanRateRow("habit_nosocial", "Привычка: Без соцсетей", true, (r) => r.habits.без_соцсетей);
  addBooleanRateRow("habit_reading", "Привычка: Чтение", true, (r) => r.habits.чтение);

  return {
    totalRecordDaysInPeriod: recordDays.length,
    totalOtherDaysInPeriod: otherDays.length,
    totalWorkoutDaysInPeriod,
    lowSampleOverall:
      recordDays.length < MIN_GROUP_DAYS || otherDays.length < MIN_GROUP_DAYS,
    rows,
  };
}

function evaluateWhitelistedPairs(slice: DailyRecord[]): {
  correlations: MetricCorrelation[];
  insufficientCount: number;
} {
  const byDate = new Map<string, DailyRecord>();
  for (const r of slice) {
    byDate.set(r.dateISO, r);
  }

  const ascSlice = [...slice].sort((a, b) =>
    a.dateISO.localeCompare(b.dateISO)
  );

  const rawCandidates: Array<MetricCorrelation & { sortScore: number; basePairKey: string }> = [];
  let insufficientCount = 0;

  for (const spec of WHITELISTED_METRIC_PAIRS) {
    // Жёсткий структурный запрет пар из одной группы или совпадающих метрик
    if (spec.leftGroup === spec.rightGroup || spec.leftKey === spec.rightKey) {
      continue;
    }

    const basePairKey = `${spec.leftKey}__${spec.rightKey}`;

    if (spec.leftType === "numeric") {
      const points: ScatterPoint[] = [];

      for (const r of ascSlice) {
        const valX = r[spec.leftKey as keyof Omit<DailyRecord, "dateISO" | "habits" | "bedtime" | "wakeup">] as number | null;
        if (valX === null || !Number.isFinite(valX)) continue;

        const targetDate =
          spec.lagDays > 0 ? addDaysISO(r.dateISO, spec.lagDays) : r.dateISO;
        const targetRec = byDate.get(targetDate);
        if (!targetRec) continue;

        const valY = targetRec[spec.rightKey] as number | null;
        if (valY === null || !Number.isFinite(valY)) continue;

        points.push({ x: valX, y: valY, dateISO: r.dateISO });
      }

      if (points.length < MIN_PAIR_SAMPLE) {
        insufficientCount++;
        continue;
      }

      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      if (variance(xs) < MIN_VARIANCE_EPS || variance(ys) < MIN_VARIANCE_EPS) {
        insufficientCount++;
        continue;
      }

      const rVal = spearmanCorrelation(xs, ys);
      if (rVal === null || Math.abs(rVal) < MIN_SIGNIFICANT_R) {
        insufficientCount++;
        continue;
      }

      const roundedR = Math.round(rVal * 100) / 100;
      const strength = classifyRStrength(roundedR);
      const signWord = roundedR >= 0 ? "прямая" : "обратная";
      const signPrefix = roundedR > 0 ? "+" : "";

      rawCandidates.push({
        id: spec.id,
        metricA: spec.leftLabel,
        metricB: spec.rightLabel,
        r: roundedR,
        sampleCount: points.length,
        label: spec.label,
        interpretation: `Наблюдаемая связь (${strength}, ${signWord}) · r = ${signPrefix}${roundedR.toFixed(2)} · n = ${points.length} дн.`,
        points,
        kind: "correlation",
        direction: spec.direction,
        lagDays: spec.lagDays,
        valueBadge: `r = ${signPrefix}${roundedR.toFixed(2)}`,
        strengthLabel: strength,
        isSignificant: true,
        isPositive: roundedR > 0,
        sortScore: Math.abs(roundedR),
        basePairKey,
      });
    } else {
      const trueVals: number[] = [];
      const falseVals: number[] = [];
      const points: ScatterPoint[] = [];

      for (const r of ascSlice) {
        const habitVal = r.habits[spec.leftKey as keyof DailyRecord["habits"]];
        if (typeof habitVal !== "boolean") continue;

        const targetDate =
          spec.lagDays > 0 ? addDaysISO(r.dateISO, spec.lagDays) : r.dateISO;
        const targetRec = byDate.get(targetDate);
        if (!targetRec) continue;

        const valY = targetRec[spec.rightKey] as number | null;
        if (valY === null || !Number.isFinite(valY)) continue;

        if (habitVal) trueVals.push(valY);
        else falseVals.push(valY);

        points.push({
          x: habitVal ? 1 : 0,
          y: valY,
          dateISO: r.dateISO,
        });
      }

      const totalN = trueVals.length + falseVals.length;
      if (
        totalN < MIN_PAIR_SAMPLE ||
        trueVals.length < MIN_BINARY_GROUP_SAMPLE ||
        falseVals.length < MIN_BINARY_GROUP_SAMPLE
      ) {
        insufficientCount++;
        continue;
      }

      const allYs = points.map((p) => p.y);
      if (variance(allYs) < MIN_VARIANCE_EPS) {
        insufficientCount++;
        continue;
      }

      const avgTrue = trueVals.reduce((a, b) => a + b, 0) / trueVals.length;
      const avgFalse = falseVals.reduce((a, b) => a + b, 0) / falseVals.length;
      const delta = round1(avgTrue - avgFalse);

      if (Math.abs(delta) < MIN_SIGNIFICANT_DELTA) {
        insufficientCount++;
        continue;
      }

      const pbR = pearsonCorrelation(
        points.map((p) => p.x),
        allYs
      );
      const effectiveR =
        pbR !== null
          ? Math.round(pbR * 100) / 100
          : Math.max(-0.99, Math.min(0.99, round1(delta / 3)));

      const strength = classifyDeltaStrength(delta, spec.rightUnit);
      const signPrefix = delta > 0 ? "+" : "";

      rawCandidates.push({
        id: spec.id,
        metricA: spec.leftLabel,
        metricB: spec.rightLabel,
        r: effectiveR,
        sampleCount: totalN,
        label: spec.label,
        interpretation: `Наблюдаемая связь (${strength}) · Разница средних: ${signPrefix}${delta.toFixed(1)} ${spec.rightUnit} (${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}) · n = ${totalN} дн.`,
        points,
        kind: "mean_diff",
        direction: spec.direction,
        lagDays: spec.lagDays,
        valueBadge: `${signPrefix}${delta.toFixed(1)} ${spec.rightUnit}`,
        strengthLabel: strength,
        isSignificant: true,
        isPositive: delta > 0,
        sortScore: Math.max(Math.abs(effectiveR), Math.min(1, Math.abs(delta) / 2.5)),
        basePairKey,
      });
    }
  }

  // Для одинаковых физических пар с разным лагом (например, Белки → Вес +1 дн. и Белки ↔ Вес) оставляем наиболее сильную
  const bestByBasePair = new Map<
    string,
    MetricCorrelation & { sortScore: number; basePairKey: string }
  >();
  for (const item of rawCandidates) {
    const existing = bestByBasePair.get(item.basePairKey);
    if (!existing || item.sortScore > existing.sortScore) {
      bestByBasePair.set(item.basePairKey, item);
    }
  }

  const deduped = Array.from(bestByBasePair.values()).sort(
    (a, b) => b.sortScore - a.sortScore
  );

  return {
    correlations: deduped.map(({ sortScore: _s, basePairKey: _b, ...rest }) => rest),
    insufficientCount,
  };
}

export function analyzeRecords(
  records: DailyRecord[],
  limitDays: number = 30,
  options: AnalyzeOptions = {}
): AnalyticsReport {
  const sortedDesc = [...records].sort((a, b) =>
    b.dateISO.localeCompare(a.dateISO)
  );
  const slice = limitDays > 0 ? sortedDesc.slice(0, limitDays) : sortedDesc;

  // ─── 1. Парные связи по белому списку осмысленных пар ───────────────────
  const { correlations, insufficientCount } = evaluateWhitelistedPairs(slice);

  // ─── 2. Влияние привычек внутри дня ─────────────────────────────────────
  const habitImpacts: HabitImpact[] = [];
  const targets: Array<{ key: "score" | "energy"; name: string }> = [
    { key: "score", name: "Оценку дня" },
    { key: "energy", name: "Энергию" },
  ];

  for (const [hKey, hName] of Object.entries(HABIT_NAMES)) {
    for (const t of targets) {
      const trueVals: number[] = [];
      const falseVals: number[] = [];

      slice.forEach((r) => {
        const val = r[t.key];
        const habitVal = r.habits[hKey as keyof DailyRecord["habits"]];
        if (val !== null && typeof habitVal === "boolean") {
          if (habitVal) trueVals.push(val);
          else falseVals.push(val);
        }
      });

      if (trueVals.length >= 3 && falseVals.length >= 2) {
        const avgTrue = trueVals.reduce((a, b) => a + b, 0) / trueVals.length;
        const avgFalse =
          falseVals.reduce((a, b) => a + b, 0) / falseVals.length;
        const delta = round1(avgTrue - avgFalse);
        const sign = delta > 0 ? "+" : "";
        const nDays = trueVals.length + falseVals.length;

        habitImpacts.push({
          habitKey: hKey,
          habitName: hName,
          targetMetric: t.key,
          avgWhenTrue: round1(avgTrue),
          avgWhenFalse: round1(avgFalse),
          delta,
          countTrue: trueVals.length,
          countFalse: falseVals.length,
          summary: `Наблюдаемая связь: в дни с привычкой среднее ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)} без неё (${sign}${delta.toFixed(1)}, n = ${nDays} дн.)`,
        });
      }
    }
  }

  habitImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 3. Эффекты на следующий день ───────────────────────────────────────
  const lagImpacts: LagImpact[] = [];
  const ascSorted = [...slice].sort((a, b) =>
    a.dateISO.localeCompare(b.dateISO)
  );
  const consecutivePairs: Array<{ cur: DailyRecord; next: DailyRecord }> = [];

  for (let i = 0; i < ascSorted.length - 1; i++) {
    const cur = ascSorted[i]!;
    const next = ascSorted[i + 1]!;
    const diffDays = Math.round(
      (parseDateMs(next.dateISO) - parseDateMs(cur.dateISO)) / 86400000
    );
    if (diffDays === 1) {
      consecutivePairs.push({ cur, next });
    }
  }

  if (consecutivePairs.length >= 5) {
    for (const [hKey, hName] of Object.entries(HABIT_NAMES)) {
      for (const t of targets) {
        const trueNext: number[] = [];
        const falseNext: number[] = [];

        consecutivePairs.forEach(({ cur, next }) => {
          const habitVal = cur.habits[hKey as keyof DailyRecord["habits"]];
          const nextVal = next[t.key];
          if (typeof habitVal === "boolean" && nextVal !== null) {
            if (habitVal) trueNext.push(nextVal);
            else falseNext.push(nextVal);
          }
        });

        if (trueNext.length >= 3 && falseNext.length >= 2) {
          const avgTrue = trueNext.reduce((a, b) => a + b, 0) / trueNext.length;
          const avgFalse =
            falseNext.reduce((a, b) => a + b, 0) / falseNext.length;
          const diff = round1(avgTrue - avgFalse);

          if (Math.abs(diff) >= 0.2) {
            const isPos = diff > 0;
            const sign = isPos ? "+" : "";
            lagImpacts.push({
              factorLabel: `${hName} (сегодня)`,
              targetLabel: `${t.name} (завтра)`,
              deltaOrR: `${sign}${diff.toFixed(1)}`,
              isPositive: isPos,
              sampleCount: trueNext.length + falseNext.length,
              description: `Наблюдаемая связь на следующий день: среднее ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`,
            });
          }
        }
      }
    }
  }

  // ─── 4. Сравнение по лимиту соцсетей ────────────────────────────────────
  const under: DailyRecord[] = [];
  const over: DailyRecord[] = [];
  for (const r of slice) {
    if (r.socialMinutes === null) continue;
    if (r.socialMinutes <= SOCIAL_LIMIT_MIN) under.push(r);
    else over.push(r);
  }

  const socialLimitInsights: SocialLimitInsight[] = [];

  for (const t of targets) {
    const underVals: number[] = [];
    const overVals: number[] = [];
    for (const r of under) {
      const v = r[t.key];
      if (v !== null) underVals.push(v);
    }
    for (const r of over) {
      const v = r[t.key];
      if (v !== null) overVals.push(v);
    }

    if (underVals.length >= 3 && overVals.length >= 3) {
      const avgUnder = underVals.reduce((a, b) => a + b, 0) / underVals.length;
      const avgOver = overVals.reduce((a, b) => a + b, 0) / overVals.length;
      const delta = round1(avgUnder - avgOver);

      const metricText = t.key === "score" ? "оценка дня" : "энергия";
      const comparison = delta > 0 ? "выше" : "ниже";
      const absDelta = Math.abs(delta).toFixed(1);
      const signedText = delta > 0 ? `+${absDelta}` : `-${absDelta}`;

      socialLimitInsights.push({
        metric: t.key,
        metricLabel: t.name,
        avgUnderLimit: round1(avgUnder),
        avgOverLimit: round1(avgOver),
        delta,
        daysUnder: underVals.length,
        daysOver: overVals.length,
        summary:
          `При удержании лимита соцсетей (≤${SOCIAL_LIMIT_MIN} мин) средняя ${metricText} ` +
          `${comparison} на ${signedText} балла ` +
          `(${underVals.length} дн. нормы / ${overVals.length} дн. превышения)`,
      });
    }
  }

  socialLimitInsights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 5. Сводная статистика по скроллингу ────────────────────────────────
  const tracked = slice.filter((r) => r.socialMinutes !== null) as Array<
    DailyRecord & { socialMinutes: number }
  >;

  const socialStats: SocialStats = {
    daysTracked: tracked.length,
    avgSocialMinutes:
      tracked.length > 0
        ? round1(
            tracked.reduce((a, r) => a + r.socialMinutes, 0) / tracked.length
          )
        : null,
    maxSocialMinutes:
      tracked.length > 0
        ? Math.max(...tracked.map((r) => r.socialMinutes))
        : null,
    daysWithinLimit: under.length,
    daysOverLimit: over.length,
    percentWithinLimit:
      tracked.length > 0 ? Math.round((under.length / tracked.length) * 100) : 0,
  };

  // ─── 6. Сравнение «Дни рекордов в тренировках против остальных дней» ─────
  const recordDaysReport = analyzeRecordDaysComparisons(
    slice,
    options.recordDatesSet ?? new Set<string>(),
    options.workoutDatesSet ?? new Set<string>()
  );

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations,
    insufficientWhitelistedCount: insufficientCount,
    topHabitImpacts: habitImpacts.slice(0, 10),
    lagImpacts: lagImpacts.slice(0, 8),
    socialLimitInsights,
    socialStats,
    recordDaysReport,
  };
}