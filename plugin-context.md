# Plugin Context

## manifest.json
```json
{
  "id": "my-correlation-analytics",
  "name": "Correlation Analytics",
  "version": "0.5.1",
  "minAppVersion": "1.4.0",
  "description": "Математический анализ корреляций привычек, сна и продуктивности в ежедневнике Obsidian.",
  "author": "Mersinho Hecke",
  "isDesktopOnly": false
}

```

## versions.json
```json
{
  "1.0.0": "1.0.0",
  "0.2.0": "1.4.0",
  "0.3.0": "1.4.0",
  "0.4.0": "1.4.0",
  "0.5.0": "1.4.0",
  "0.5.1": "1.4.0"
}

```

## package.json
```json
{
	"name": "obsidian-sample-plugin",
	"version": "0.5.1",
	"description": "This is a sample plugin for Obsidian (https://obsidian.md)",
	"main": "main.js",
	"type": "module",
	"scripts": {
		"dev": "node esbuild.config.mjs",
		"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
		"version": "node version-bump.mjs && git add manifest.json versions.json",
		"lint": "eslint ."
	},
	"keywords": [],
	"license": "0-BSD",
	"devDependencies": {
		"@eslint/js": "^9.39.4",
		"@types/node": "^22.15.17",
		"esbuild": "0.25.5",
		"eslint": "^9.39.4",
		"eslint-plugin-obsidianmd": "^0.4.0",
		"globals": "^17.6.0",
		"jiti": "^2.6.1",
		"obsidian": "latest",
		"typescript": "^5.8.3",
		"typescript-eslint": "^8.59.1"
	}
}

```

## styles.css
```css
.modal.mod-correlation-report {
  width: 92vw !important;
  max-width: 720px !important;
  max-height: 88vh !important;
  padding: 18px 22px !important;
  border-radius: 12px !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  overflow-y: auto !important;
}

.mca-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.mca-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mca-title-row h2 {
  margin: 0 !important;
  font-size: 1.15rem;
}

.mca-tabs-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Тач-кнопки переключения периодов */
.mca-tab-btn {
  min-height: 32px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.14s ease;
}

.mca-tab-btn:hover {
  border-color: var(--interactive-accent);
  color: var(--text-normal);
}

.mca-tab-btn.is-active {
  background: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-primary));
  border-color: var(--interactive-accent);
  color: var(--text-normal);
  font-weight: 700;
}

.mca-sub {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.mca-sec-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-normal);
  margin: 14px 0 8px 0 !important;
}

.mca-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.mca-card {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.mca-card.is-interactive {
  cursor: pointer;
  user-select: none;
}

.mca-card.is-interactive:hover {
  border-color: var(--interactive-accent);
}

.mca-card.is-expanded {
  border-color: var(--interactive-accent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

.mca-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mca-card-label {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-normal);
}

.mca-delta-badge {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mca-delta-badge.is-up {
  color: #4aab80;
  background: rgba(74, 171, 128, 0.12);
  border-color: rgba(74, 171, 128, 0.4);
}

.mca-delta-badge.is-down {
  color: #d85b57;
  background: rgba(216, 91, 87, 0.12);
  border-color: rgba(216, 91, 87, 0.4);
}

.mca-card-desc {
  font-size: 0.74rem;
  line-height: 1.32;
  color: var(--text-muted);
}

.mca-empty {
  font-size: 0.78rem;
  color: var(--text-faint);
  padding: 8px;
}

/* Стили векторного Scatter Plot */
.mca-plot-host {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--background-modifier-border);
  cursor: default;
}

.mca-scatter-svg {
  display: block;
  user-select: none;
  background: var(--background-secondary);
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
}

.mca-axis {
  stroke: var(--background-modifier-border);
  stroke-width: 1.2;
  fill: none;
}

.mca-trend-line {
  stroke-width: 2;
  stroke-dasharray: 4 3;
}

.mca-scatter-dot {
  fill: var(--interactive-accent);
  stroke: var(--background-primary);
  stroke-width: 1;
  opacity: 0.85;
}

.mca-axis-label {
  font-size: 9px;
  fill: var(--text-muted);
  font-family: var(--font-interface);
}

.mca-axis-x {
  text-anchor: end;
}

.mca-axis-y {
  text-anchor: start;
}

/* Лаг-карточки отложенного эффекта */
.mca-card.is-lag-card {
  border-left: 3px solid #599ed6;
}
```

## src/data-collector.ts
```ts
import { App } from "obsidian";
import { DailyRecord } from "./types";

const DIARY_FOLDER = "Ежедневник";
const SOCIAL_LIMIT_MIN = 30;

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

/**
 * Парсер `соцсети_мин`: допускает число или числовую строку ("25", "25,5", " 25 "),
 * ограничивает диапазон [0, 1440] и округляет до целого.
 */
function parseSocialMinutes(v: unknown): number | null {
  let raw: number | null = null;

  if (typeof v === "number" && Number.isFinite(v)) {
    raw = v;
  } else if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v.trim().replace(",", "."));
    if (Number.isFinite(parsed)) raw = parsed;
  }

  if (raw === null) return null;
  return Math.max(0, Math.min(1440, Math.round(raw)));
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
    const socialMinutes = parseSocialMinutes(fm["соцсети_мин"]);

    // Флаг «без_соцсетей»: если в YAML уже задан явно — доверяем ему,
    // иначе выводим из порога ≤ 30 мин.
    let noSocials = parseBool(fm["без_соцсетей"]);
    if (noSocials === null && socialMinutes !== null) {
      noSocials = socialMinutes <= SOCIAL_LIMIT_MIN;
    }

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
      focusHours: parseNum(fm["глубокая_работа_часов"]),
      socialMinutes,
      bedtime: parseTimeStr(fm["отбой"]),
      wakeup: parseTimeStr(fm["подъём"]),
      habits: {
        nofap: parseBool(fm["nofap"]),
        тренировка: parseBool(fm["тренировка"]),
        чтение: parseBool(fm["чтение"]),
        режим_сна: parseBool(fm["режим_сна"]),
        диета: parseBool(fm["диета"]),
        без_соцсетей: noSocials
      }
    });
  }

  return Array.from(recordsMap.values());
}
```

## src/engine.ts
```ts
import {
  DailyRecord,
  MetricCorrelation,
  HabitImpact,
  AnalyticsReport,
  ScatterPoint,
  LagImpact,
  SocialLimitInsight,
  SocialStats
} from "./types";

export const SOCIAL_LIMIT_MIN = 30;
const MIN_SAMPLE = 4;

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
  { key: "screenHours", label: "Экран (ч)" },
  { key: "socialMinutes", label: "Скроллинг соцсетей" },
  { key: "steps", label: "Шаги" },
  { key: "calories", label: "Калории" },
  { key: "pagesRead", label: "Чтение (стр)" },
  { key: "weight", label: "Вес" }
];

const HABIT_NAMES: Record<string, string> = {
  nofap: "NoFap",
  тренировка: "Тренировка",
  чтение: "Чтение",
  режим_сна: "Режим сна",
  диета: "Диета",
  без_соцсетей: "Без соцсетей"
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

export function analyzeRecords(records: DailyRecord[], limitDays: number = 30): AnalyticsReport {
  const sortedDesc = [...records].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const slice = limitDays > 0 ? sortedDesc.slice(0, limitDays) : sortedDesc;

  // ─── 1. Парные корреляции Пирсона (включая socialMinutes) ─────────────────
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

  // ─── 2. Влияние привычек (включая «без_соцсетей») ─────────────────────────
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
          summary: `В дни с привычкой средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)} без неё (${sign}${delta.toFixed(1)})`
        });
      }
    }
  }

  habitImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 3. Лаг-анализ (t → t+1) ──────────────────────────────────────────────
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
              description: `На следующий день после соблюдения ${hName} средний показатель: ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`
            });
          }
        }
      }
    }

    // Соцсети сегодня → Оценка / Энергия завтра
    const socialLagPairs = consecutivePairs
      .map(({ cur, next }) => ({
        social: cur.socialMinutes,
        scoreNext: next.score,
        energyNext: next.energy
      }))
      .filter(
        (p): p is { social: number; scoreNext: number; energyNext: number } =>
          p.social !== null && p.scoreNext !== null && p.energyNext !== null
      );

    if (socialLagPairs.length >= 5) {
      const rScoreNext = pearsonCorrelation(
        socialLagPairs.map(p => p.social),
        socialLagPairs.map(p => p.scoreNext)
      );
      if (rScoreNext !== null && Math.abs(rScoreNext) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Скроллинг соцсетей (сегодня)",
          targetLabel: "Оценка дня (завтра)",
          deltaOrR: `r = ${rScoreNext > 0 ? "+" : ""}${rScoreNext.toFixed(2)}`,
          isPositive: rScoreNext >= 0,
          sampleCount: socialLagPairs.length,
          description: `Минуты скроллинга накануне связаны с самооценкой следующего дня (${interpretR(rScoreNext).toLowerCase()})`
        });
      }

      const rEnergyNext = pearsonCorrelation(
        socialLagPairs.map(p => p.social),
        socialLagPairs.map(p => p.energyNext)
      );
      if (rEnergyNext !== null && Math.abs(rEnergyNext) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Скроллинг соцсетей (сегодня)",
          targetLabel: "Энергия (завтра)",
          deltaOrR: `r = ${rEnergyNext > 0 ? "+" : ""}${rEnergyNext.toFixed(2)}`,
          isPositive: rEnergyNext >= 0,
          sampleCount: socialLagPairs.length,
          description: `Минуты скроллинга накануне связаны с уровнем энергии следующего дня (${interpretR(rEnergyNext).toLowerCase()})`
        });
      }
    }

    // Фокус сегодня → Оценка завтра
    const focusLagPairs = consecutivePairs
      .map(({ cur, next }) => ({
        focus: cur.focusHours,
        energyNext: next.energy,
        scoreNext: next.score
      }))
      .filter(
        (p): p is { focus: number; energyNext: number; scoreNext: number } =>
          p.focus !== null && p.energyNext !== null && p.scoreNext !== null
      );

    if (focusLagPairs.length >= 5) {
      const rFocusScore = pearsonCorrelation(
        focusLagPairs.map(p => p.focus),
        focusLagPairs.map(p => p.scoreNext)
      );
      if (rFocusScore !== null && Math.abs(rFocusScore) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Глубокая работа (сегодня)",
          targetLabel: "Оценка дня (завтра)",
          deltaOrR: `r = ${rFocusScore > 0 ? "+" : ""}${rFocusScore.toFixed(2)}`,
          isPositive: rFocusScore >= 0,
          sampleCount: focusLagPairs.length,
          description: `Часы фокуса накануне связаны с ощущением продуктивности следующего дня (${interpretR(rFocusScore).toLowerCase()})`
        });
      }
    }

    // Экран сегодня → Энергия завтра
    const screenLagPairs = consecutivePairs
      .map(({ cur, next }) => ({ screen: cur.screenHours, energyNext: next.energy }))
      .filter(
        (p): p is { screen: number; energyNext: number } =>
          p.screen !== null && p.energyNext !== null
      );

    if (screenLagPairs.length >= 5) {
      const rScreenEnergy = pearsonCorrelation(
        screenLagPairs.map(p => p.screen),
        screenLagPairs.map(p => p.energyNext)
      );
      if (rScreenEnergy !== null && Math.abs(rScreenEnergy) >= 0.2) {
        lagImpacts.push({
          factorLabel: "Экранное время (сегодня)",
          targetLabel: "Энергия (завтра)",
          deltaOrR: `r = ${rScreenEnergy > 0 ? "+" : ""}${rScreenEnergy.toFixed(2)}`,
          isPositive: rScreenEnergy >= 0,
          sampleCount: screenLagPairs.length,
          description: `Длительность у экрана накануне связана с уровнем энергии следующего дня (${interpretR(rScreenEnergy).toLowerCase()})`
        });
      }
    }
  }

  // ─── 4. Когортный анализ по лимиту соцсетей (≤ SOCIAL_LIMIT_MIN vs >) ─────
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
          `(выборка: ${underVals.length} дн. нормы / ${overVals.length} дн. превышения)`
      });
    }
  }

  socialLimitInsights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 5. Сводная статистика по скроллингу ─────────────────────────────────
  const tracked = slice.filter(r => r.socialMinutes !== null) as Array<
    DailyRecord & { socialMinutes: number }
  >;

  const socialStats: SocialStats = {
    daysTracked: tracked.length,
    avgSocialMinutes:
      tracked.length > 0
        ? round1(tracked.reduce((a, r) => a + r.socialMinutes, 0) / tracked.length)
        : null,
    maxSocialMinutes:
      tracked.length > 0 ? Math.max(...tracked.map(r => r.socialMinutes)) : null,
    daysWithinLimit: under.length,
    daysOverLimit: over.length,
    percentWithinLimit:
      tracked.length > 0 ? Math.round((under.length / tracked.length) * 100) : 0
  };

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations.slice(0, 10),
    topHabitImpacts: habitImpacts.slice(0, 10),
    lagImpacts: lagImpacts.slice(0, 8),
    socialLimitInsights,
    socialStats
  };
}
```

## src/main.ts
```ts
import { Plugin, Notice } from "obsidian";
import { collectDailyRecords } from "./data-collector";
import { analyzeRecords } from "./engine";
import { CorrelationReportModal } from "./report-modal";
import { AnalyticsReport, DailyRecord } from "./types";

export default class MyCorrelationAnalyticsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.addRibbonIcon("trending-up", "Дневник: Аналитика корреляций", () => {
      this.openAnalyticsReport();
    });

    this.addCommand({
      id: "run-correlation-analytics",
      name: "Дневник: Рассчитать корреляции привычек",
      callback: () => {
        this.openAnalyticsReport();
      }
    });

    (window as unknown as Record<string, unknown>).__myCorrelationAnalytics = this;
  }

  onunload(): void {
    delete (window as unknown as Record<string, unknown>).__myCorrelationAnalytics;
  }

  /** Сырые записи из папки «Ежедневник» (включая socialMinutes). */
  public getRawRecords(): DailyRecord[] {
    return collectDailyRecords(this.app);
  }

  /**
   * Отчёт аналитики за N дней.
   * Тип AnalyticsReport содержит поля:
   *  - topCorrelations (включая пары со «Скроллинг соцсетей»)
   *  - topHabitImpacts (включая привычку «без_соцсетей»)
   *  - lagImpacts (включая social → завтрашние score/energy)
   *  - socialLimitInsights (когортный анализ ≤30 / >30 мин)
   *  - socialStats (avg / max / % дней в лимите)
   */
  public getReport(days: number = 30): AnalyticsReport {
    const records = this.getRawRecords();
    return analyzeRecords(records, days);
  }

  public openAnalyticsReport(days: number = 30): void {
    const records = this.getRawRecords();
    if (records.length < 4) {
      new Notice("В папке «Ежедневник» найдено меньше 4 записей с датами.");
      return;
    }
    new CorrelationReportModal(this.app, records, days).open();
  }
}
```

## src/report-modal.ts
```ts
import { App, Modal } from "obsidian";
import { AnalyticsReport, DailyRecord } from "./types";
import { analyzeRecords, SOCIAL_LIMIT_MIN } from "./engine";
import { renderScatterPlotSvg } from "./scatter-plot";

function isSocialMetric(label: string): boolean {
  return /соцсет/i.test(label);
}

export class CorrelationReportModal extends Modal {
  private allRecords: DailyRecord[];
  private currentDays: number = 30;
  private expandedCorrelationId: string | null = null;

  constructor(app: App, allRecords: DailyRecord[], initialDays: number = 30) {
    super(app);
    this.allRecords = allRecords;
    this.currentDays = initialDays;
  }

  onOpen(): void {
    const { modalEl } = this;
    modalEl.addClass("mod-correlation-report");
    this.renderModal();
  }

  private renderModal(): void {
    const { contentEl } = this;
    contentEl.empty();

    const report: AnalyticsReport = analyzeRecords(this.allRecords, this.currentDays);

    // ── Шапка и переключатель периодов ──────────────────────────────────────
    const head = contentEl.createDiv({ cls: "mca-head" });
    const titleRow = head.createDiv({ cls: "mca-title-row" });
    titleRow.createEl("h2", { text: "📊 Аналитика корреляций ежедневника" });

    const tabsRow = head.createDiv({ cls: "mca-tabs-row" });
    const periods: Array<{ days: number; label: string }> = [
      { days: 30, label: "30 дней" },
      { days: 90, label: "90 дней" },
      { days: 0, label: "Все время" }
    ];

    periods.forEach(p => {
      const isAct = this.currentDays === p.days;
      const tabBtn = tabsRow.createEl("button", {
        cls: `mca-tab-btn ${isAct ? "is-active" : ""}`,
        text: p.label,
        attr: { type: "button" }
      });
      tabBtn.onclick = () => {
        if (this.currentDays !== p.days) {
          this.currentDays = p.days;
          this.expandedCorrelationId = null;
          this.renderModal();
        }
      };
    });

    head.createDiv({
      cls: "mca-sub",
      text: `Выборка: ${report.totalRecords} дней записи`
    });

    // ── Блок: сводка по скроллингу соцсетей ────────────────────────────────
    if (report.socialStats.daysTracked > 0) {
      contentEl.createEl("h3", {
        text: "📱 Скроллинг соцсетей (сводка за период)",
        cls: "mca-sec-title"
      });
      const socialPanel = contentEl.createDiv({ cls: "mca-card mca-social-panel" });
      const s = report.socialStats;

      const rowAvg = socialPanel.createDiv({ cls: "mca-card-top" });
      rowAvg.createSpan({
        cls: "mca-card-label",
        text: `Среднее время скроллинга (${s.daysTracked} дн.)`
      });
      rowAvg.createSpan({
        cls: "mca-delta-badge",
        text: `${s.avgSocialMinutes?.toFixed(1) ?? "—"} мин`
      });

      socialPanel.createDiv({
        cls: "mca-card-desc",
        text:
          `🛡️ Дней в пределах лимита (≤${SOCIAL_LIMIT_MIN} мин): ` +
          `${s.daysWithinLimit} из ${s.daysTracked} (${s.percentWithinLimit}%) · ` +
          `Максимум за день: ${s.maxSocialMinutes ?? "—"} мин`
      });
    }

    // ── Блок: влияние превышения лимита соцсетей (когортный анализ) ────────
    if (report.socialLimitInsights.length > 0) {
      contentEl.createEl("h3", {
        text: `🛡️ Влияние превышения лимита соцсетей (>${SOCIAL_LIMIT_MIN} мин)`,
        cls: "mca-sec-title"
      });
      const socialGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

      report.socialLimitInsights.forEach(item => {
        const card = socialGrid.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({
          cls: "mca-card-label",
          text: `📱 Соцсети → ${item.metric === "score" ? "Оценка" : "Энергия"}`
        });
        topRow.createSpan({
          cls: `mca-delta-badge ${item.delta > 0 ? "is-up" : "is-down"}`,
          text: (item.delta > 0 ? "+" : "") + item.delta.toFixed(1)
        });
        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // ── Блок 1: привычки внутри дня ────────────────────────────────────────
    contentEl.createEl("h3", {
      text: "⚡ Наблюдаемые различия привычек (в тот же день)",
      cls: "mca-sec-title"
    });
    const habitsGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topHabitImpacts.length === 0) {
      habitsGrid.createDiv({
        cls: "mca-empty",
        text: "Недостаточно данных для сравнения привычек за выбранный период."
      });
    } else {
      report.topHabitImpacts.forEach(item => {
        const card = habitsGrid.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });

        const isSocialHabit = item.habitKey === "без_соцсетей";
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocialHabit ? "📱 " : ""}${item.habitName} → ${
            item.targetMetric === "score" ? "Оценка" : "Энергия"
          }`
        });

        const isPositive = item.delta > 0;
        topRow.createSpan({
          cls: `mca-delta-badge ${isPositive ? "is-up" : "is-down"}`,
          text: (isPositive ? "+" : "") + item.delta.toFixed(1)
        });

        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // ── Блок 2: лаг-эффекты ────────────────────────────────────────────────
    contentEl.createEl("h3", {
      text: "⏳ Отложенные эффекты (на следующий день t → t+1)",
      cls: "mca-sec-title"
    });
    const lagGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.lagImpacts.length === 0) {
      lagGrid.createDiv({
        cls: "mca-empty",
        text: "Недостаточно пар последовательных дней для расчёта лаг-эффекта."
      });
    } else {
      report.lagImpacts.forEach(lag => {
        const card = lagGrid.createDiv({ cls: "mca-card is-lag-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });

        const isSocial = isSocialMetric(lag.factorLabel) || isSocialMetric(lag.targetLabel);
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocial ? "📱 " : ""}${lag.factorLabel} → ${lag.targetLabel}`
        });

        topRow.createSpan({
          cls: `mca-delta-badge ${lag.isPositive ? "is-up" : "is-down"}`,
          text: lag.deltaOrR
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${lag.description} (${lag.sampleCount} пар дней)`
        });
      });
    }

    // ── Блок 3: корреляции + scatter plot ─────────────────────────────────
    contentEl.createEl("h3", {
      text: "📈 Связи показателей (нажми для графика рассеяния)",
      cls: "mca-sec-title"
    });
    const corrGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topCorrelations.length === 0) {
      corrGrid.createDiv({
        cls: "mca-empty",
        text: "Заметных линейных корреляций за этот период не выявлено."
      });
    } else {
      report.topCorrelations.forEach(item => {
        const isExpanded = this.expandedCorrelationId === item.id;
        const card = corrGrid.createDiv({
          cls: `mca-card is-interactive ${isExpanded ? "is-expanded" : ""}`
        });

        const topRow = card.createDiv({ cls: "mca-card-top" });
        const isSocial = isSocialMetric(item.metricA) || isSocialMetric(item.metricB);
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocial ? "📱 " : ""}${item.label}`
        });

        topRow.createSpan({
          cls: "mca-delta-badge",
          text: `r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${item.interpretation} (${item.sampleCount} дн.) · ${
            isExpanded ? "свернуть ▲" : "график ▾"
          }`
        });

        card.onclick = () => {
          this.expandedCorrelationId = isExpanded ? null : item.id;
          this.renderModal();
        };

        if (isExpanded) {
          const plotHost = card.createDiv({ cls: "mca-plot-host" });
          plotHost.onclick = e => e.stopPropagation();
          const svg = renderScatterPlotSvg(item.points, item.metricA, item.metricB, item.r);
          plotHost.appendChild(svg);
        }
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

## src/scatter-plot.ts
```ts
import { ScatterPoint } from "./types";

export function renderScatterPlotSvg(
  points: ScatterPoint[],
  labelX: string,
  labelY: string,
  r: number
): SVGSVGElement {
  const width = 320;
  const height = 180;
  const pad = { top: 20, right: 20, bottom: 30, left: 38 };

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const toSvgX = (x: number) => pad.left + ((x - minX) / spanX) * (width - pad.left - pad.right);
  const toSvgY = (y: number) => height - pad.bottom - ((y - minY) / spanY) * (height - pad.top - pad.bottom);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "mca-scatter-svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "auto");

  // Оси
  const axes = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axes.setAttribute("d", `M ${pad.left} ${pad.top} L ${pad.left} ${height - pad.bottom} L ${width - pad.right} ${height - pad.bottom}`);
  axes.setAttribute("class", "mca-axis");
  svg.appendChild(axes);

  // Линия тренда (линейная регрессия y = slope * x + intercept)
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom !== 0) {
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const startX = minX;
    const endX = maxX;
    const startY = slope * startX + intercept;
    const endY = slope * endX + intercept;

    const trend = document.createElementNS("http://www.w3.org/2000/svg", "line");
    trend.setAttribute("x1", String(toSvgX(startX)));
    trend.setAttribute("y1", String(toSvgY(startY)));
    trend.setAttribute("x2", String(toSvgX(endX)));
    trend.setAttribute("y2", String(toSvgY(endY)));
    trend.setAttribute("class", "mca-trend-line");
    trend.setAttribute("stroke", r >= 0 ? "#4aab80" : "#d85b57");
    svg.appendChild(trend);
  }

  // Точки дней
  for (const p of points) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(toSvgX(p.x)));
    circle.setAttribute("cy", String(toSvgY(p.y)));
    circle.setAttribute("r", "3.5");
    circle.setAttribute("class", "mca-scatter-dot");

    const tip = document.createElementNS("http://www.w3.org/2000/svg", "title");
    tip.textContent = `${p.dateISO}: ${labelX} = ${p.x}, ${labelY} = ${p.y}`;
    circle.appendChild(tip);

    svg.appendChild(circle);
  }

  // Подписи осей
  const textX = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textX.setAttribute("x", String(width - pad.right));
  textX.setAttribute("y", String(height - 8));
  textX.setAttribute("class", "mca-axis-label mca-axis-x");
  textX.textContent = labelX;
  svg.appendChild(textX);

  const textY = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textY.setAttribute("x", String(pad.left));
  textY.setAttribute("y", "12");
  textY.setAttribute("class", "mca-axis-label mca-axis-y");
  textY.textContent = labelY;
  svg.appendChild(textY);

  return svg;
}
```

## src/types.ts
```ts
export interface DailyRecord {
  dateISO: string;
  score: number | null;
  energy: number | null;
  sleepHours: number | null;
  calories: number | null;
  weight: number | null;
  pagesRead: number | null;
  screenHours: number | null;
  steps: number | null;
  focusHours: number | null; // глубокая_работа_часов
  socialMinutes: number | null; // соцсети_мин
  bedtime: string | null;
  wakeup: string | null;
  habits: {
    nofap: boolean | null;
    тренировка: boolean | null;
    чтение: boolean | null;
    режим_сна: boolean | null;
    диета: boolean | null;
    без_соцсетей: boolean | null;
  };
}

export interface ScatterPoint {
  x: number;
  y: number;
  dateISO: string;
}

export interface MetricCorrelation {
  id: string;
  metricA: string;
  metricB: string;
  r: number; // -1.0 .. 1.0
  sampleCount: number;
  label: string;
  interpretation: string;
  points: ScatterPoint[];
}

export interface HabitImpact {
  habitKey: string;
  habitName: string;
  targetMetric: "score" | "energy";
  avgWhenTrue: number;
  avgWhenFalse: number;
  delta: number;
  countTrue: number;
  countFalse: number;
  summary: string;
}

export interface LagImpact {
  factorLabel: string;
  targetLabel: string;
  deltaOrR: string;
  isPositive: boolean;
  sampleCount: number;
  description: string;
}

/** Когортный инсайт: сравнение дней нормы (≤30 мин) и превышения лимита соцсетей */
export interface SocialLimitInsight {
  metric: "score" | "energy";
  metricLabel: string;
  avgUnderLimit: number;
  avgOverLimit: number;
  delta: number;
  daysUnder: number;
  daysOver: number;
  summary: string;
}

/** Сводная статистика по скроллингу соцсетей за период */
export interface SocialStats {
  daysTracked: number;
  avgSocialMinutes: number | null;
  maxSocialMinutes: number | null;
  daysWithinLimit: number;
  daysOverLimit: number;
  percentWithinLimit: number;
}

export interface AnalyticsReport {
  periodDays: number;
  totalRecords: number;
  topCorrelations: MetricCorrelation[];
  topHabitImpacts: HabitImpact[];
  lagImpacts: LagImpact[];
  socialLimitInsights: SocialLimitInsight[];
  socialStats: SocialStats;
}
```
