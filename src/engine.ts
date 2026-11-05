import {
  DailyRecord,
  MetricCorrelation,
  HabitImpact,
  AnalyticsReport,
  ScatterPoint,
  LagImpact,
  SocialLimitInsight,
  SocialStats,
  PRAnalyticsReport,
  PRDayEntry,
  PRLagMode,
  PRMetricComparisonRow,
  PRMetricCriterion,
  PRComparisonScope,
} from "./types";

export const SOCIAL_LIMIT_MIN = 30;
const MIN_SAMPLE = 4;
const MIN_PR_GROUP_SAMPLE = 3;

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
  return "Линейная связь незначительна";
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

function previousDateISO(iso: string): string {
  const ms = parseDateMs(iso);
  if (!ms) return "";
  const prev = new Date(ms - 86400000);
  const y = prev.getUTCFullYear();
  const m = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const d = String(prev.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface AnalyzeOptions {
  limitDays?: number;
  prDaysByDate?: Map<string, PRDayEntry>;
  workoutDatesSet?: Set<string>;
  prCriterion?: PRMetricCriterion;
  prLagMode?: PRLagMode;
  prComparisonScope?: PRComparisonScope;
}

/**
 * Сравнивает метрики ежедневника в «дни рекордов» против «остальных дней»
 * с учётом лага (в тот же день t или накануне t-1).
 */
export function analyzePRDayComparisons(
  allRecords: DailyRecord[],
  sliceRecords: DailyRecord[],
  prDaysByDate: Map<string, PRDayEntry>,
  workoutDatesSet: Set<string>,
  criterion: PRMetricCriterion,
  lagMode: PRLagMode,
  comparisonScope: PRComparisonScope
): PRAnalyticsReport {
  const recordByDate = new Map<string, DailyRecord>();
  for (const r of allRecords) {
    recordByDate.set(r.dateISO, r);
  }

  const sliceDatesSet = new Set<string>(sliceRecords.map((r) => r.dateISO));

  // Список дней рекордов, попавших в выбранный период
  const prDaysInPeriod: PRDayEntry[] = [];
  for (const [dateISO, entry] of prDaysByDate.entries()) {
    if (sliceDatesSet.has(dateISO)) {
      prDaysInPeriod.push(entry);
    }
  }
  prDaysInPeriod.sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  // Формируем две выборки целевых дат: PR-дни и группа сравнения
  const prTargetDates: string[] = [];
  const otherTargetDates: string[] = [];
  let totalWorkoutDaysInPeriod = 0;

  for (const r of sliceRecords) {
    const isWorkoutDay =
      workoutDatesSet.has(r.dateISO) || r.habits.тренировка === true;
    if (isWorkoutDay) totalWorkoutDaysInPeriod++;

    if (prDaysByDate.has(r.dateISO)) {
      prTargetDates.push(r.dateISO);
    } else {
      if (comparisonScope === "workout_days" && !isWorkoutDay) {
        continue;
      }
      otherTargetDates.push(r.dateISO);
    }
  }

  // Разрешение записи с учётом выбранного режима лага (день t или накануне t-1)
  const resolveRecordForDate = (targetDateISO: string): DailyRecord | undefined => {
    const lookupDate =
      lagMode === "prev_day" ? previousDateISO(targetDateISO) : targetDateISO;
    return lookupDate ? recordByDate.get(lookupDate) : undefined;
  };

  const prResolved = prTargetDates
    .map(resolveRecordForDate)
    .filter((r): r is DailyRecord => r !== undefined);
  const otherResolved = otherTargetDates
    .map(resolveRecordForDate)
    .filter((r): r is DailyRecord => r !== undefined);

  const rows: PRMetricComparisonRow[] = [];

  const addNumericRow = (
    key: string,
    label: string,
    unit: string,
    higherIsBetter: boolean,
    getter: (r: DailyRecord) => number | null
  ) => {
    const prVals: number[] = [];
    const otherVals: number[] = [];

    for (const r of prResolved) {
      const v = getter(r);
      if (v !== null && Number.isFinite(v)) prVals.push(v);
    }
    for (const r of otherResolved) {
      const v = getter(r);
      if (v !== null && Number.isFinite(v)) otherVals.push(v);
    }

    if (prVals.length === 0 && otherVals.length === 0) return;

    const avgPR =
      prVals.length > 0
        ? round1(prVals.reduce((a, b) => a + b, 0) / prVals.length)
        : null;
    const avgOther =
      otherVals.length > 0
        ? round1(otherVals.reduce((a, b) => a + b, 0) / otherVals.length)
        : null;
    const delta =
      avgPR !== null && avgOther !== null ? round1(avgPR - avgOther) : null;

    rows.push({
      key,
      label,
      unit,
      kind: "numeric",
      higherIsBetter,
      avgPR,
      avgOther,
      delta,
      countPR: prVals.length,
      countOther: otherVals.length,
      lowSample:
        prVals.length < MIN_PR_GROUP_SAMPLE ||
        otherVals.length < MIN_PR_GROUP_SAMPLE,
    });
  };

  const addBooleanRateRow = (
    key: string,
    label: string,
    higherIsBetter: boolean,
    getter: (r: DailyRecord) => boolean | null
  ) => {
    const prBools: boolean[] = [];
    const otherBools: boolean[] = [];

    for (const r of prResolved) {
      const b = getter(r);
      if (typeof b === "boolean") prBools.push(b);
    }
    for (const r of otherResolved) {
      const b = getter(r);
      if (typeof b === "boolean") otherBools.push(b);
    }

    if (prBools.length === 0 && otherBools.length === 0) return;

    const avgPR =
      prBools.length > 0
        ? Math.round((prBools.filter(Boolean).length / prBools.length) * 100)
        : null;
    const avgOther =
      otherBools.length > 0
        ? Math.round(
            (otherBools.filter(Boolean).length / otherBools.length) * 100
          )
        : null;
    const delta = avgPR !== null && avgOther !== null ? avgPR - avgOther : null;

    rows.push({
      key,
      label,
      unit: "%",
      kind: "habit_pct",
      higherIsBetter,
      avgPR,
      avgOther,
      delta,
      countPR: prBools.length,
      countOther: otherBools.length,
      lowSample:
        prBools.length < MIN_PR_GROUP_SAMPLE ||
        otherBools.length < MIN_PR_GROUP_SAMPLE,
    });
  };

  // Числовые метрики
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
  addNumericRow("focusHours", "Глубокая работа (фокус)", "ч", true, (r) => r.focusHours);
  addNumericRow("steps", "Шаги", "шаг", true, (r) => r.steps);
  addNumericRow("pagesRead", "Чтение", "стр", true, (r) => r.pagesRead);
  addNumericRow("socialMinutes", "Скроллинг соцсетей", "мин", false, (r) => r.socialMinutes);

  // Привычки (% выполнения)
  addBooleanRateRow("habit_nofap", "Привычка: NoFap", true, (r) => r.habits.nofap);
  addBooleanRateRow(
    "habit_sleep",
    "Привычка: Режим сна",
    true,
    (r) => r.habits.режим_сна
  );
  addBooleanRateRow("habit_diet", "Привычка: Диета", true, (r) => r.habits.диета);
  addBooleanRateRow(
    "habit_nosocial",
    "Привычка: Без соцсетей",
    true,
    (r) => r.habits.без_соцсетей
  );
  addBooleanRateRow("habit_reading", "Привычка: Чтение", true, (r) => r.habits.чтение);

  return {
    criterion,
    lagMode,
    comparisonScope,
    totalPRDaysInPeriod: prTargetDates.length,
    totalComparisonDaysInPeriod: otherTargetDates.length,
    totalWorkoutDaysInPeriod,
    lowSampleOverall:
      prTargetDates.length < MIN_PR_GROUP_SAMPLE ||
      otherTargetDates.length < MIN_PR_GROUP_SAMPLE,
    rows,
    prDays: prDaysInPeriod,
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

  // ─── 1. Парные корреляции Пирсона ─────────────────────────────────────────
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

  // ─── 3. Лаг-анализ (t → t+1) ──────────────────────────────────────────────
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
              description: `На следующий день после соблюдения ${hName} средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`,
            });
          }
        }
      }
    }

    const socialLagPairs = consecutivePairs
      .map(({ cur, next }) => ({
        social: cur.socialMinutes,
        scoreNext: next.score,
        energyNext: next.energy,
      }))
      .filter(
        (p): p is { social: number; scoreNext: number; energyNext: number } =>
          p.social !== null && p.scoreNext !== null && p.energyNext !== null
      );

    if (socialLagPairs.length >= 5) {
      const rScoreNext = pearsonCorrelation(
        socialLagPairs.map((p) => p.social),
        socialLagPairs.map((p) => p.scoreNext)
      );
      if (rScoreNext !== null && Math.abs(rScoreNext) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Скроллинг соцсетей (сегодня)",
          targetLabel: "Оценка дня (завтра)",
          deltaOrR: `r = ${rScoreNext > 0 ? "+" : ""}${rScoreNext.toFixed(2)}`,
          isPositive: rScoreNext >= 0,
          sampleCount: socialLagPairs.length,
          description: `Минуты скроллинга накануне связаны с самооценкой следующего дня (${interpretR(rScoreNext).toLowerCase()})`,
        });
      }

      const rEnergyNext = pearsonCorrelation(
        socialLagPairs.map((p) => p.social),
        socialLagPairs.map((p) => p.energyNext)
      );
      if (rEnergyNext !== null && Math.abs(rEnergyNext) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Скроллинг соцсетей (сегодня)",
          targetLabel: "Энергия (завтра)",
          deltaOrR: `r = ${rEnergyNext > 0 ? "+" : ""}${rEnergyNext.toFixed(2)}`,
          isPositive: rEnergyNext >= 0,
          sampleCount: socialLagPairs.length,
          description: `Минуты скроллинга накануне связаны с уровнем энергии следующего дня (${interpretR(rEnergyNext).toLowerCase()})`,
        });
      }
    }

    const focusLagPairs = consecutivePairs
      .map(({ cur, next }) => ({
        focus: cur.focusHours,
        energyNext: next.energy,
        scoreNext: next.score,
      }))
      .filter(
        (p): p is { focus: number; energyNext: number; scoreNext: number } =>
          p.focus !== null && p.energyNext !== null && p.scoreNext !== null
      );

    if (focusLagPairs.length >= 5) {
      const rFocusScore = pearsonCorrelation(
        focusLagPairs.map((p) => p.focus),
        focusLagPairs.map((p) => p.scoreNext)
      );
      if (rFocusScore !== null && Math.abs(rFocusScore) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Глубокая работа (сегодня)",
          targetLabel: "Оценка дня (завтра)",
          deltaOrR: `r = ${rFocusScore > 0 ? "+" : ""}${rFocusScore.toFixed(2)}`,
          isPositive: rFocusScore >= 0,
          sampleCount: focusLagPairs.length,
          description: `Часы фокуса накануне связаны с ощущением продуктивности следующего дня (${interpretR(rFocusScore).toLowerCase()})`,
        });
      }
    }

    const screenLagPairs = consecutivePairs
      .map(({ cur, next }) => ({
        screen: cur.screenHours,
        energyNext: next.energy,
      }))
      .filter(
        (p): p is { screen: number; energyNext: number } =>
          p.screen !== null && p.energyNext !== null
      );

    if (screenLagPairs.length >= 5) {
      const rScreenEnergy = pearsonCorrelation(
        screenLagPairs.map((p) => p.screen),
        screenLagPairs.map((p) => p.energyNext)
      );
      if (rScreenEnergy !== null && Math.abs(rScreenEnergy) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Экранное время (сегодня)",
          targetLabel: "Энергия (завтра)",
          deltaOrR: `r = ${rScreenEnergy > 0 ? "+" : ""}${rScreenEnergy.toFixed(2)}`,
          isPositive: rScreenEnergy >= 0,
          sampleCount: screenLagPairs.length,
          description: `Длительность у экрана накануне связана с уровнем энергии следующего дня (${interpretR(rScreenEnergy).toLowerCase()})`,
        });
      }
    }
  }

  // ─── 4. Когортный анализ по лимиту соцсетей ───────────────────────────────
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
          `(выборка: ${underVals.length} дн. нормы / ${overVals.length} дн. превышения)`,
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

  // ─── 6. Сравнение «Дни рекордов vs Остальные дни» ─────────────────────────
  const prReport = analyzePRDayComparisons(
    records,
    slice,
    options.prDaysByDate ?? new Map<string, PRDayEntry>(),
    options.workoutDatesSet ?? new Set<string>(),
    options.prCriterion ?? "max_reps",
    options.prLagMode ?? "same_day",
    options.prComparisonScope ?? "all_days"
  );

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations.slice(0, 10),
    topHabitImpacts: habitImpacts.slice(0, 10),
    lagImpacts: lagImpacts.slice(0, 8),
    socialLimitInsights,
    socialStats,
    prReport,
  };
}
