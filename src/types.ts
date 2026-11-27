// src/types.ts
export interface CorrelationAnalyticsSettings {
  diaryFolder: string;
  workoutsFolder: string;
  socialLimitMin: number;
  valuesCompassPath: string;
  readingLogPath: string;
}

export const DEFAULT_SETTINGS: CorrelationAnalyticsSettings = {
  diaryFolder: "Ежедневник",
  workoutsFolder: "Знания",
  socialLimitMin: 30,
  valuesCompassPath: "_system/values-compass.json",
  readingLogPath: "_system/reading-log.json",
};

export interface WorkoutDayMetrics {
  sessionsCount: number;
  durationMin: number | null;
  setsCount: number;
  totalReps: number;
  totalHoldSec: number;
  weightedSetsCount: number;
  tonnageKg: number;
}

export interface DailyRecord {
  dateISO: string;
  score: number | null;
  energy: number | null;
  sleepHours: number | null;
  calories: number | null;
  protein: number | null; // белки_г
  fats: number | null; // жиры_г
  carbs: number | null; // углеводы_г
  weight: number | null;
  pagesRead: number | null;
  screenHours: number | null;
  steps: number | null;
  focusHours: number | null; // из глубокая_работа_мин / глубокая_работа_часов / фокус_по_целям
  socialMinutes: number | null; // соцсети_мин
  valuesActionsCount: number | null; // кол-во ценностных действий из _system/values-compass.json
  dayProgressPct: number | null; // прогресс_дня_процент (или расчёт по цели_дня)
  dayGoalsCount: number | null; // количество задач в цели_дня
  srCardsReviewed: number | null; // карточек_пройдено (my-sr-trainer)
  grammarExercises: number | null; // грамматика_упражнений (my-grammar-trainer)
  bedtimeHour: number | null; // отбой в часах с непрерывной шкалой (00:30 -> 24.5)
  wakeupHour: number | null; // подъём в часах (07:30 -> 7.5)
  workoutDurationMin: number | null; // длительность_мин из Знания/Тренировка *.md
  workoutSetsCount: number | null; // число подходов в день тренировки
  workoutTotalReps: number | null; // сумма повторений в день тренировки
  workoutTonnageKg: number | null; // тоннаж доп. веса (повторы * доп_вес_кг)
  bedtime: string | null;
  wakeup: string | null;
  habits: {
    nofap: boolean | null;
    тренировка: boolean | null;
    чтение: boolean | null;
    режим_сна: boolean | null;
    диета: boolean | null;
    без_соцсетей: boolean | null;
    момент_присутствия: boolean | null;
  };
}

export type MetricGroup =
  | "nutrition"
  | "body"
  | "sleep"
  | "wellbeing"
  | "activity"
  | "focus"
  | "digital"
  | "reading"
  | "discipline"
  | "values"
  | "learning"
  | "planning";

export type NumericMetricKey = keyof Omit<
  DailyRecord,
  "dateISO" | "habits" | "bedtime" | "wakeup"
>;

export type HabitMetricKey = keyof DailyRecord["habits"];

export type WhitelistSourceType = "numeric" | "habit";

export type PairDirection = "→" | "↔";

export interface WhitelistPairSpec {
  id: string;
  leftKey: NumericMetricKey | HabitMetricKey;
  leftType: WhitelistSourceType;
  leftGroup: MetricGroup;
  leftLabel: string;
  rightKey: NumericMetricKey;
  rightGroup: MetricGroup;
  rightLabel: string;
  rightUnit: string;
  direction: PairDirection;
  lagDays: number;
  label: string;
  rationale: string;
}

export type ExerciseLoadType = "bw" | "weighted" | "unspec";

export interface ExerciseVariantSpec {
  key: string;
  name: string;
  variant: string;
  loadType: ExerciseLoadType;
  weight: number | null;
  loadSortOrder: number;
}

export interface RecordDayMetricRow {
  key: string;
  label: string;
  unit: string;
  kind: "numeric" | "habit_pct";
  higherIsBetter: boolean;
  avgRecordDays: number | null;
  avgOtherDays: number | null;
  delta: number | null;
  countRecordDays: number;
  countOtherDays: number;
  lowSample: boolean;
  conclusion: string;
}

export type TargetMetricKey = "score" | "energy" | "focusHours";

export interface RecordDaysReport {
  totalRecordDaysInPeriod: number;
  totalWorkoutDaysInPeriod: number;
  totalBaselineDaysInPeriod: number;
  comparisonBaseline: "workout_days" | "all_days";
  lowSampleOverall: boolean;
  rows: RecordDayMetricRow[];
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
  r: number;
  sampleCount: number;
  label: string;
  interpretation: string;
  points: ScatterPoint[];
  kind?: "correlation" | "mean_diff";
  direction?: PairDirection;
  lagDays?: number;
  valueBadge?: string;
  strengthLabel?: string;
  isSignificant?: boolean;
  isPositive?: boolean;
}

export interface HabitImpact {
  habitKey: string;
  habitName: string;
  targetMetric: TargetMetricKey;
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

export interface SocialLimitInsight {
  metric: TargetMetricKey;
  metricLabel: string;
  avgUnderLimit: number;
  avgOverLimit: number;
  delta: number;
  daysUnder: number;
  daysOver: number;
  summary: string;
}

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
  insufficientWhitelistedCount?: number;
  topHabitImpacts: HabitImpact[];
  lagImpacts: LagImpact[];
  socialLimitInsights: SocialLimitInsight[];
  socialStats: SocialStats;
  recordDaysReport: RecordDaysReport;
}