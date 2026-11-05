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
} from "./types";

export const SOCIAL_LIMIT_MIN = 30;
const MIN_SAMPLE = 4;
const MIN_GROUP_DAYS = 3;

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < MIN_SAMPLE) return null;
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

  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0 || !Number.isFinite(denom)) return null;

  const r = (n * sumXY - sumX * sumY) / denom;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}

function interpretR(r: number): string {
  const absR = Math.abs(r);
  const sign = r >= 0 ? "прямая" : "обратная";
  if (absR >= 0.65) return `Заметная ${sign} связь`;
  if (absR >= 0.35) return `Умеренная ${sign} связь`;
  if (absR >= 0.18) return `Слабая ${sign} связь`;
  return "Связь почти не выражена";
}

const NUMERIC_METRICS: Array<{
  key: keyof Omit<DailyRecord, "dateISO" | "habits" | "bedtime" | "wakeup">;
  label: string;
}> = [
  { key: "score", label: "Оценка дня" },
  { key: "energy", label: "Энергия" },
  { key: "focusHours", label: "Глубокая работа" },
  { key: "sleepHours", label: "Длительность сна" },
  { key: "calories", label: "Калории" },
  { key: "protein", label: "Белки (г)" },
  { key: "fats", label: "Жиры (г)" },
  { key: "carbs", label: "Углеводы (г)" },
  { key: "screenHours", label: "Экран (ч)" },
  { key: "socialMinutes", label: "Скроллинг соцсетей" },
  { key: "steps", label: "Шаги" },
  { key: "pagesRead", label: "Чтение (стр)" },
  { key: "weight", label: "Вес" },
];

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

export function analyzeRecords(
  records: DailyRecord[],
  limitDays: number = 30,
  options: AnalyzeOptions = {}
): AnalyticsReport {
  const sortedDesc = [...records].sort((a, b) =>
    b.dateISO.localeCompare(a.dateISO)
  );
  const slice = limitDays > 0 ? sortedDesc.slice(0, limitDays) : sortedDesc;

  // ─── 1. Парные связи показателей ──────────────────────────────────────────
  const correlations: MetricCorrelation[] = [];

  for (let i = 0; i < NUMERIC_METRICS.length; i++) {
    for (let j = i + 1; j < NUMERIC_METRICS.length; j++) {
      const mA = NUMERIC_METRICS[i]!;
      const mB = NUMERIC_METRICS[j]!;

      const points: ScatterPoint[] = [];
      for (const r of slice) {
        const valA = r[mA.key] as number | null;
        const valB = r[mB.key] as number | null;
        if (valA !== null && valB !== null) {
          points.push({ x: valA, y: valB, dateISO: r.dateISO });
        }
      }

      if (points.length >= 5) {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const r = pearsonCorrelation(xs, ys);

        if (r !== null && Math.abs(r) >= 0.15) {
          correlations.push({
            id: `${mA.key}_${mB.key}`,
            metricA: mA.label,
            metricB: mB.label,
            r: Math.round(r * 100) / 100,
            sampleCount: points.length,
            label: `${mA.label} ↔ ${mB.label}`,
            interpretation: interpretR(r),
            points,
          });
        }
      }
    }
  }

  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // ─── 2. Влияние привычек ──────────────────────────────────────────────────
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

        habitImpacts.push({
          habitKey: hKey,
          habitName: hName,
          targetMetric: t.key,
          avgWhenTrue: round1(avgTrue),
          avgWhenFalse: round1(avgFalse),
          delta,
          countTrue: trueVals.length,
          countFalse: falseVals.length,
          summary: `В дни с привычкой средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)} без неё (${sign}${delta.toFixed(1)})`,
        });
      }
    }
  }

  habitImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 3. Эффекты на следующий день ─────────────────────────────────────────
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
              description: `На следующий день после соблюдения привычки средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`,
            });
          }
        }
      }
    }
  }

  // ─── 4. Сравнение по лимиту соцсетей ──────────────────────────────────────
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

  // ─── 5. Сводная статистика по скроллингу ─────────────────────────────────
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

  // ─── 6. Сравнение «Дни рекордов в тренировках против остальных дней» ──────
  const recordDaysReport = analyzeRecordDaysComparisons(
    slice,
    options.recordDatesSet ?? new Set<string>(),
    options.workoutDatesSet ?? new Set<string>()
  );

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations.slice(0, 10),
    topHabitImpacts: habitImpacts.slice(0, 10),
    lagImpacts: lagImpacts.slice(0, 8),
    socialLimitInsights,
    socialStats,
    recordDaysReport,
  };
}
