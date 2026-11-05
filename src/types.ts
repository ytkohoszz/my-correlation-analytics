export type PRMetricCriterion = "max_reps" | "total_volume" | "max_weight" | "any";
export type PRLagMode = "same_day" | "prev_day";
export type PRComparisonScope = "all_days" | "workout_days";

export interface CorrelationAnalyticsSettings {
  diaryFolder: string;
  workoutsFolder: string;
  prCriterion: PRMetricCriterion;
  prLagMode: PRLagMode;
  prComparisonScope: PRComparisonScope;
}

export const DEFAULT_SETTINGS: CorrelationAnalyticsSettings = {
  diaryFolder: "Ежедневник",
  workoutsFolder: "Знания",
  prCriterion: "max_reps",
  prLagMode: "same_day",
  prComparisonScope: "all_days",
};

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

export type ExerciseLoadType = "bw" | "weighted" | "unspec";

export interface ExerciseVariantSpec {
  key: string;
  name: string;
  variant: string;
  loadType: ExerciseLoadType;
  weight: number | null;
  loadSortOrder: number;
}

export interface PRRecordEvent {
  variantKey: string;
  exerciseName: string;
  variant: string;
  loadType: ExerciseLoadType;
  weight: number | null;
  unit: "повт." | "с";
  criterionTriggered: "max_reps" | "total_volume" | "max_weight";
  newValue: number;
  previousBest: number;
  setsSummary: string;
}

export interface PRDayEntry {
  dateISO: string;
  workoutPath: string;
  workoutTitle: string;
  events: PRRecordEvent[];
}

export interface PRMetricComparisonRow {
  key: string;
  label: string;
  unit: string;
  kind: "numeric" | "habit_pct";
  higherIsBetter: boolean;
  avgPR: number | null;
  avgOther: number | null;
  delta: number | null;
  countPR: number;
  countOther: number;
  lowSample: boolean;
}

export interface PRAnalyticsReport {
  criterion: PRMetricCriterion;
  lagMode: PRLagMode;
  comparisonScope: PRComparisonScope;
  totalPRDaysInPeriod: number;
  totalComparisonDaysInPeriod: number;
  totalWorkoutDaysInPeriod: number;
  lowSampleOverall: boolean;
  rows: PRMetricComparisonRow[];
  prDays: PRDayEntry[];
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
  prReport: PRAnalyticsReport;
}
