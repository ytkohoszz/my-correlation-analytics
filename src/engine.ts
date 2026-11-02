import { DailyRecord, MetricCorrelation, HabitImpact, AnalyticsReport, ScatterPoint, LagImpact } from "./types";

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 4) return null;
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

const NUMERIC_METRICS: Array<{ key: keyof Omit<DailyRecord, "dateISO" | "habits">; label: string }> = [
  { key: "score", label: "Оценка дня" },
  { key: "energy", label: "Энергия" },
  { key: "sleepHours", label: "Сон (ч)" },
  { key: "calories", label: "Калории" },
  { key: "pagesRead", label: "Чтение (стр)" },
  { key: "weight", label: "Вес" }
];

const HABIT_NAMES: Record<string, string> = {
  nofap: "NoFap",
  тренировка: "Тренировка",
  чтение: "Чтение",
  режим_сна: "Режим сна",
  диета: "Диета"
};

function parseDateMs(iso: string): number {
  const parts = iso.split("-").map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  }
  return 0;
}

export function analyzeRecords(records: DailyRecord[], limitDays: number = 30): AnalyticsReport {
  const sortedDesc = [...records].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const slice = limitDays > 0 ? sortedDesc.slice(0, limitDays) : sortedDesc;

  // 1. Корреляции внутри дня
  const correlations: MetricCorrelation[] = [];

  for (let i = 0; i < NUMERIC_METRICS.length; i++) {
    for (let j = i + 1; j < NUMERIC_METRICS.length; j++) {
      const mA = NUMERIC_METRICS[i]!;
      const mB = NUMERIC_METRICS[j]!;

      const points: ScatterPoint[] = [];
      for (const r of slice) {
        const valA = r[mA.key];
        const valB = r[mB.key];
        if (valA !== null && valB !== null) {
          points.push({ x: valA, y: valB, dateISO: r.dateISO });
        }
      }

      if (points.length >= 5) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
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
            points
          });
        }
      }
    }
  }

  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // 2. Влияние привычек внутри дня
  const habitImpacts: HabitImpact[] = [];
  const targets: Array<{ key: "score" | "energy"; name: string }> = [
    { key: "score", name: "Оценку дня" },
    { key: "energy", name: "Энергию" }
  ];

  for (const [hKey, hName] of Object.entries(HABIT_NAMES)) {
    for (const t of targets) {
      const trueVals: number[] = [];
      const falseVals: number[] = [];

      slice.forEach(r => {
        const val = r[t.key];
        const habitVal = r.habits[hKey as keyof DailyRecord["habits"]];
        if (val !== null && typeof habitVal === "boolean") {
          if (habitVal) trueVals.push(val);
          else falseVals.push(val);
        }
      });

      if (trueVals.length >= 3 && falseVals.length >= 2) {
        const avgTrue = trueVals.reduce((a, b) => a + b, 0) / trueVals.length;
        const avgFalse = falseVals.reduce((a, b) => a + b, 0) / falseVals.length;
        const delta = Math.round((avgTrue - avgFalse) * 10) / 10;
        const sign = delta > 0 ? "+" : "";

        habitImpacts.push({
          habitKey: hKey,
          habitName: hName,
          targetMetric: t.key,
          avgWhenTrue: Math.round(avgTrue * 10) / 10,
          avgWhenFalse: Math.round(avgFalse * 10) / 10,
          delta,
          countTrue: trueVals.length,
          countFalse: falseVals.length,
          summary: `В дни с привычкой средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)} без неё (${sign}${delta.toFixed(1)})`
        });
      }
    }
  }

  habitImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // 3. Лаг-анализ со сдвигом в 1 день (t -> t+1)
  const lagImpacts: LagImpact[] = [];
  const ascSorted = [...slice].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const consecutivePairs: Array<{ cur: DailyRecord; next: DailyRecord }> = [];

  for (let i = 0; i < ascSorted.length - 1; i++) {
    const cur = ascSorted[i]!;
    const next = ascSorted[i + 1]!;
    const diffDays = Math.round((parseDateMs(next.dateISO) - parseDateMs(cur.dateISO)) / 86400000);
    if (diffDays === 1) {
      consecutivePairs.push({ cur, next });
    }
  }

  if (consecutivePairs.length >= 5) {
    // Влияние привычек дня t на энергию и оценку дня t+1
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
          const avgFalse = falseNext.reduce((a, b) => a + b, 0) / falseNext.length;
          const diff = Math.round((avgTrue - avgFalse) * 10) / 10;

          if (Math.abs(diff) >= 0.2) {
            const isPos = diff > 0;
            const sign = isPos ? "+" : "";
            lagImpacts.push({
              factorLabel: `${hName} (сегодня)`,
              targetLabel: `${t.name} (завтра)`,
              deltaOrR: `${sign}${diff.toFixed(1)}`,
              isPositive: isPos,
              sampleCount: trueNext.length + falseNext.length,
              description: `На следующий день после соблюдения ${hName} средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`
            });
          }
        }
      }
    }

    // Влияние сна дня t на самочувствие дня t+1
    const sleepPairs = consecutivePairs
      .map(({ cur, next }) => ({ sleep: cur.sleepHours, energyNext: next.energy, scoreNext: next.score }))
      .filter((p): p is { sleep: number; energyNext: number; scoreNext: number } => p.sleep !== null && p.energyNext !== null && p.scoreNext !== null);

    if (sleepPairs.length >= 5) {
      const rSleepEnergy = pearsonCorrelation(sleepPairs.map(p => p.sleep), sleepPairs.map(p => p.energyNext));
      if (rSleepEnergy !== null && Math.abs(rSleepEnergy) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Сон (этой ночью)",
          targetLabel: "Энергия (завтра)",
          deltaOrR: `r = ${rSleepEnergy > 0 ? "+" : ""}${rSleepEnergy.toFixed(2)}`,
          isPositive: rSleepEnergy >= 0,
          sampleCount: sleepPairs.length,
          description: `Продолжительность сна связана с уровнем энергии следующего дня (${interpretR(rSleepEnergy).toLowerCase()})`
        });
      }
    }
  }

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations.slice(0, 8),
    topHabitImpacts: habitImpacts.slice(0, 8),
    lagImpacts: lagImpacts.slice(0, 6)
  };
}