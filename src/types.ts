export interface DailyRecord {
  dateISO: string;
  score: number | null; // оценка_дня (1-10)
  energy: number | null; // энергия (1-10)
  sleepHours: number | null; // сон_часов
  calories: number | null; // калории_ккал
  weight: number | null; // вес_кг
  pagesRead: number | null; // страниц_прочитано
  habits: {
    nofap: boolean | null;
    тренировка: boolean | null;
    чтение: boolean | null;
    режим_сна: boolean | null;
    диета: boolean | null;
  };
}

export interface MetricCorrelation {
  metricA: string;
  metricB: string;
  r: number; // -1.0 .. 1.0
  sampleCount: number;
  label: string;
  interpretation: string;
}

export interface HabitImpact {
  habitKey: string;
  habitName: string;
  targetMetric: "score" | "energy";
  avgWhenTrue: number;
  avgWhenFalse: number;
  delta: number; // avgWhenTrue - avgWhenFalse
  countTrue: number;
  countFalse: number;
  summary: string;
}

export interface AnalyticsReport {
  periodDays: number;
  totalRecords: number;
  topCorrelations: MetricCorrelation[];
  topHabitImpacts: HabitImpact[];
}