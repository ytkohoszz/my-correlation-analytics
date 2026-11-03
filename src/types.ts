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

export interface AnalyticsReport {
  periodDays: number;
  totalRecords: number;
  topCorrelations: MetricCorrelation[];
  topHabitImpacts: HabitImpact[];
  lagImpacts: LagImpact[];
}