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
  NumericMetricKey,
  TargetMetricKey,
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
  bedtimeHour: "sleep",
  wakeupHour: "sleep",
  режим_сна: "sleep",
  score: "wellbeing",
  energy: "wellbeing",
  тренировка: "activity",
  steps: "activity",
  workoutDurationMin: "activity",
  workoutSetsCount: "activity",
  workoutTotalReps: "activity",
  workoutTonnageKg: "activity",
  focusHours: "focus",
  socialMinutes: "digital",
  screenHours: "digital",
  без_соцсетей: "digital",
  pagesRead: "reading",
  чтение: "reading",
  nofap: "discipline",
  valuesActionsCount: "values",
  момент_присутствия: "values",
  dayProgressPct: "planning",
  dayGoalsCount: "planning",
  srCardsReviewed: "learning",
  grammarExercises: "learning",
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
  {
    id: "values_actions_score",
    leftKey: "valuesActionsCount",
    leftType: "numeric",
    leftGroup: "values",
    leftLabel: "Ценностные действия",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Ценностные действия → Оценка дня",
    // Осознанные шаги в сторону личных ценностей повышают субъективную осмысленность и оценку дня
    rationale: "Количество зафиксированных ценностных действий влияет на итоговую оценку дня",
  },
  {
    id: "values_actions_energy",
    leftKey: "valuesActionsCount",
    leftType: "numeric",
    leftGroup: "values",
    leftLabel: "Ценностные действия",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Ценностные действия → Энергия",
    rationale: "Сопряжённость ценностной активности и дневного уровня энергии",
  },
  {
    id: "values_actions_focus",
    leftKey: "valuesActionsCount",
    leftType: "numeric",
    leftGroup: "values",
    leftLabel: "Ценностные действия",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "↔",
    lagDays: 0,
    label: "Ценностные действия ↔ Фокус",
    rationale: "Согласованность осмысленных действий и времени глубокой работы",
  },
  {
    id: "savoring_score",
    leftKey: "момент_присутствия",
    leftType: "habit",
    leftGroup: "values",
    leftLabel: "Момент присутствия",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Момент присутствия → Оценка дня",
    rationale: "Практика присутствия усиливает субъективное качество дня",
  },
  {
    id: "savoring_energy",
    leftKey: "момент_присутствия",
    leftType: "habit",
    leftGroup: "values",
    leftLabel: "Момент присутствия",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Момент присутствия → Энергия",
    rationale: "Связь практики присутствия с ощущением внутреннего ресурса",
  },
  // ── Фокус и план дня ────────────────────────────────────────────────────
  {
    id: "sleep_hours_focus",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → Глубокая работа",
    rationale: "Продолжительность сна определяет когнитивный ресурс для фокуса",
  },
  {
    id: "sleep_regime_focus",
    leftKey: "режим_сна",
    leftType: "habit",
    leftGroup: "sleep",
    leftLabel: "Режим сна",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Режим сна → Глубокая работа",
    rationale: "Стабильный график сна поддерживает длительность глубокой работы",
  },
  {
    id: "energy_focus",
    leftKey: "energy",
    leftType: "numeric",
    leftGroup: "wellbeing",
    leftLabel: "Энергия",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "↔",
    lagDays: 0,
    label: "Энергия ↔ Глубокая работа",
    rationale: "Связь дневного уровня энергии с объёмом глубокого фокуса",
  },
  {
    id: "workout_focus",
    leftKey: "тренировка",
    leftType: "habit",
    leftGroup: "activity",
    leftLabel: "Тренировка",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Тренировка → Глубокая работа",
    rationale: "Влияние силовой тренировки на объём глубокой работы в тот же день",
  },
  {
    id: "focus_energy_lag1",
    leftKey: "focusHours",
    leftType: "numeric",
    leftGroup: "focus",
    leftLabel: "Глубокая работа (ч)",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 1,
    label: "Глубокая работа → Энергия (+1 дн.)",
    rationale: "Отслеживание когнитивной усталости или подъёма на следующий день",
  },
  {
    id: "focus_day_progress",
    leftKey: "focusHours",
    leftType: "numeric",
    leftGroup: "focus",
    leftLabel: "Глубокая работа (ч)",
    rightKey: "dayProgressPct",
    rightGroup: "planning",
    rightLabel: "План дня (%)",
    rightUnit: "%",
    direction: "→",
    lagDays: 0,
    label: "Глубокая работа → План дня",
    rationale: "Время в фокусе определяет долю выполненных задач плана дня",
  },
  {
    id: "day_progress_score",
    leftKey: "dayProgressPct",
    leftType: "numeric",
    leftGroup: "planning",
    leftLabel: "План дня (%)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "План дня → Оценка дня",
    rationale: "Выполнение запланированных целей напрямую влияет на оценку дня",
  },
  {
    id: "sleep_hours_day_progress",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "dayProgressPct",
    rightGroup: "planning",
    rightLabel: "План дня (%)",
    rightUnit: "%",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → План дня",
    rationale: "Качество восстановления отражается на закрытии задач дня",
  },
  {
    id: "social_day_progress",
    leftKey: "socialMinutes",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Скроллинг соцсетей (мин)",
    rightKey: "dayProgressPct",
    rightGroup: "planning",
    rightLabel: "План дня (%)",
    rightUnit: "%",
    direction: "→",
    lagDays: 0,
    label: "Скроллинг соцсетей → План дня",
    rationale: "Скроллинг вытесняет время на выполнение целей дня",
  },
  // ── Время отбоя и экранное время ────────────────────────────────────────
  {
    id: "bedtime_energy_sync",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Время отбоя → Энергия",
    rationale: "Более ранний отбой поддерживает утреннюю бодрость",
  },
  {
    id: "bedtime_energy_lag1",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 1,
    label: "Время отбоя → Энергия (+1 дн.)",
    rationale: "Время отбоя вечером отражается на энергии следующего дня",
  },
  {
    id: "bedtime_score_sync",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Время отбоя → Оценка дня",
    rationale: "Сдвиг отбоя влияет на субъективное качество дня",
  },
  {
    id: "bedtime_score_lag1",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 1,
    label: "Время отбоя → Оценка дня (+1 дн.)",
    rationale: "Поздний отбой вечером снижает качество следующего дня",
  },
  {
    id: "bedtime_focus_sync",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Время отбоя → Глубокая работа",
    rationale: "Стабильный ранний отбой поддерживает концентрацию",
  },
  {
    id: "bedtime_focus_lag1",
    leftKey: "bedtimeHour",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Время отбоя",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 1,
    label: "Время отбоя → Глубокая работа (+1 дн.)",
    rationale: "Поздний отбой вечером снижает объём фокуса на следующий день",
  },
  {
    id: "screen_sleep_sync",
    leftKey: "screenHours",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Экранное время (ч)",
    rightKey: "sleepHours",
    rightGroup: "sleep",
    rightLabel: "Длительность сна (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Экранное время → Сон",
    rationale: "Высокое экранное время сокращает ночной сон",
  },
  {
    id: "screen_sleep_lag1",
    leftKey: "screenHours",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Экранное время (ч)",
    rightKey: "sleepHours",
    rightGroup: "sleep",
    rightLabel: "Длительность сна (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 1,
    label: "Экранное время → Сон (+1 дн.)",
    rationale: "Высокая экранная нагрузка влияет на сон следующей ночи",
  },
  {
    id: "screen_focus",
    leftKey: "screenHours",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Экранное время (ч)",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "→",
    lagDays: 0,
    label: "Экранное время → Глубокая работа",
    rationale: "Избыточное время у экрана телефона мешает глубокой работе",
  },
  {
    id: "screen_score",
    leftKey: "screenHours",
    leftType: "numeric",
    leftGroup: "digital",
    leftLabel: "Экранное время (ч)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Экранное время → Оценка дня",
    rationale: "Связь общего экранного времени с итоговой оценкой дня",
  },
  // ── Количественные метрики тренировок и углеводы ────────────────────────
  {
    id: "workout_sets_energy_lag1",
    leftKey: "workoutSetsCount",
    leftType: "numeric",
    leftGroup: "activity",
    leftLabel: "Подходы тренировки",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 1,
    label: "Подходы тренировки → Энергия (+1 дн.)",
    rationale: "Объём силовой тренировки влияет на восстановление и энергию на следующий день",
  },
  {
    id: "workout_tonnage_energy_lag1",
    leftKey: "workoutTonnageKg",
    leftType: "numeric",
    leftGroup: "activity",
    leftLabel: "Тоннаж доп. веса (кг)",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 1,
    label: "Тоннаж тренировки → Энергия (+1 дн.)",
    rationale: "Силовая нагрузка с дополнительным весом и утомление на следующий день",
  },
  {
    id: "workout_duration_score",
    leftKey: "workoutDurationMin",
    leftType: "numeric",
    leftGroup: "activity",
    leftLabel: "Длительность тренировки (мин)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Длительность тренировки → Оценка дня",
    rationale: "Сопряжённость продолжительности тренировки и оценки дня",
  },
  {
    id: "sleep_workout_reps",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "workoutTotalReps",
    rightGroup: "activity",
    rightLabel: "Повторения за тренировку",
    rightUnit: "повт.",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → Объём повторений",
    rationale: "Влияние ночного сна на тренировочный объём",
  },
  {
    id: "sleep_workout_tonnage",
    leftKey: "sleepHours",
    leftType: "numeric",
    leftGroup: "sleep",
    leftLabel: "Длительность сна (ч)",
    rightKey: "workoutTonnageKg",
    rightGroup: "activity",
    rightLabel: "Тоннаж доп. веса (кг)",
    rightUnit: "кг",
    direction: "→",
    lagDays: 0,
    label: "Длительность сна → Тоннаж",
    rationale: "Влияние сна на работу с дополнительным весом",
  },
  {
    id: "carbs_workout_reps_lag1",
    leftKey: "carbs",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Углеводы (г)",
    rightKey: "workoutTotalReps",
    rightGroup: "activity",
    rightLabel: "Повторения за тренировку",
    rightUnit: "повт.",
    direction: "→",
    lagDays: 1,
    label: "Углеводы → Объём повторений (+1 дн.)",
    rationale: "Запас гликогена после углеводного рациона накануне тренировки",
  },
  {
    id: "carbs_energy",
    leftKey: "carbs",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Углеводы (г)",
    rightKey: "energy",
    rightGroup: "wellbeing",
    rightLabel: "Энергия",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Углеводы → Энергия",
    rationale: "Влияние потребления углеводов на дневной уровень энергии",
  },
  {
    id: "carbs_weight_lag1",
    leftKey: "carbs",
    leftType: "numeric",
    leftGroup: "nutrition",
    leftLabel: "Углеводы (г)",
    rightKey: "weight",
    rightGroup: "body",
    rightLabel: "Вес (кг)",
    rightUnit: "кг",
    direction: "→",
    lagDays: 1,
    label: "Углеводы → Вес (+1 дн.)",
    rationale: "Задержка гликогена и воды на утреннем взвешивании следующего дня",
  },
  // ── Чтение и обучение (SR-карточки, грамматика) ─────────────────────────
  {
    id: "pages_score",
    leftKey: "pagesRead",
    leftType: "numeric",
    leftGroup: "reading",
    leftLabel: "Чтение (стр.)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Чтение (стр.) → Оценка дня",
    rationale: "Связь объёма чтения с удовлетворённостью днём",
  },
  {
    id: "pages_sleep_sync",
    leftKey: "pagesRead",
    leftType: "numeric",
    leftGroup: "reading",
    leftLabel: "Чтение (стр.)",
    rightKey: "sleepHours",
    rightGroup: "sleep",
    rightLabel: "Длительность сна (ч)",
    rightUnit: "ч",
    direction: "↔",
    lagDays: 0,
    label: "Чтение (стр.) ↔ Сон",
    rationale: "Сопряжённость спокойного чтения и длительности сна",
  },
  {
    id: "sr_cards_score",
    leftKey: "srCardsReviewed",
    leftType: "numeric",
    leftGroup: "learning",
    leftLabel: "SR-карточки",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "SR-карточки → Оценка дня",
    rationale: "Связь ежедневного повторения карточек с оценкой дня",
  },
  {
    id: "sr_cards_focus",
    leftKey: "srCardsReviewed",
    leftType: "numeric",
    leftGroup: "learning",
    leftLabel: "SR-карточки",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "↔",
    lagDays: 0,
    label: "SR-карточки ↔ Глубокая работа",
    rationale: "Сопряжённость регулярного повторения карточек и учебного фокуса",
  },
  {
    id: "grammar_score",
    leftKey: "grammarExercises",
    leftType: "numeric",
    leftGroup: "learning",
    leftLabel: "Грамматика (упр.)",
    rightKey: "score",
    rightGroup: "wellbeing",
    rightLabel: "Оценка дня",
    rightUnit: "балла",
    direction: "→",
    lagDays: 0,
    label: "Грамматика → Оценка дня",
    rationale: "Связь практики английской грамматики с оценкой дня",
  },
  {
    id: "grammar_focus",
    leftKey: "grammarExercises",
    leftType: "numeric",
    leftGroup: "learning",
    leftLabel: "Грамматика (упр.)",
    rightKey: "focusHours",
    rightGroup: "focus",
    rightLabel: "Глубокая работа (ч)",
    rightUnit: "ч",
    direction: "↔",
    lagDays: 0,
    label: "Грамматика ↔ Глубокая работа",
    rationale: "Сопряжённость упражнений по грамматике с общим учебным ритмом",
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
  if (unit === "балла" || unit === "ч") {
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
  момент_присутствия: "Момент присутствия",
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
  lowSample: boolean,
  baselineName: string
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
    ((key === "sleepHours" || key === "prev_sleepHours") && absVal < 0.08) ||
    ((key === "focusHours" || key === "prev_focusHours") && absVal < 0.08) ||
    (key === "bedtimeHour" && absVal < 0.08) ||
    ((key === "calories" || key === "prev_calories") && absVal < 15) ||
    (key === "workoutTonnageKg" && absVal < 15) ||
    (key === "workoutDurationMin" && absVal < 2) ||
    (key === "steps" && absVal < 100) ||
    absVal < 0.05
  ) {
    return `${prefix}По сравнению с ${baselineName} почти не отличается`;
  }

  if (key === "bedtimeHour") {
    const durText = formatHoursDiffHuman(delta);
    return delta > 0
      ? `${prefix}В дни рекордов отбой в среднем на ${durText} позже`
      : `${prefix}В дни рекордов отбой в среднем на ${durText} раньше`;
  }

  if (key === "sleepHours" || key === "prev_sleepHours") {
    const durText = formatHoursDiffHuman(delta);
    const what = key === "prev_sleepHours" ? "сон накануне" : "сон";
    return delta > 0
      ? `${prefix}В дни рекордов ${what} в среднем на ${durText} дольше`
      : `${prefix}В дни рекордов ${what} в среднем на ${durText} короче`;
  }

  if (key === "focusHours" || key === "prev_focusHours") {
    const durText = formatHoursDiffHuman(delta);
    const what =
      key === "prev_focusHours" ? "глубокая работа накануне" : "глубокая работа";
    return delta > 0
      ? `${prefix}В дни рекордов ${what} в среднем на ${durText} дольше`
      : `${prefix}В дни рекордов ${what} в среднем на ${durText} меньше`;
  }

  const cleanUnit = unit === "/10" ? "балла" : unit;
  const word = delta > 0 ? "выше" : "ниже";
  return `${prefix}В дни рекордов ${label.toLowerCase()} в среднем на ${formatNumRu(absVal)} ${cleanUnit} ${word}`;
}

export interface AnalyzeOptions {
  recordDatesSet?: Set<string>;
  workoutDatesSet?: Set<string>;
  socialLimitMin?: number;
}

/**
 * Сравнивает показатели в дни рекордов против обычных тренировочных дней
 * (или всех остальных дней периода, если обычных тренировок меньше 3).
 */
export function analyzeRecordDaysComparisons(
  sliceRecords: DailyRecord[],
  recordDatesSet: Set<string>,
  workoutDatesSet: Set<string>,
  allRecordsByDate?: Map<string, DailyRecord>
): RecordDaysReport {
  const lookupByDate =
    allRecordsByDate ??
    new Map<string, DailyRecord>(sliceRecords.map((r) => [r.dateISO, r]));

  const recordDays: DailyRecord[] = [];
  const nonRecordWorkoutDays: DailyRecord[] = [];
  const allNonRecordDays: DailyRecord[] = [];
  let totalWorkoutDaysInPeriod = 0;

  for (const r of sliceRecords) {
    const isWorkoutDay =
      workoutDatesSet.has(r.dateISO) || r.habits.тренировка === true;
    if (isWorkoutDay) {
      totalWorkoutDaysInPeriod++;
    }
    if (recordDatesSet.has(r.dateISO)) {
      recordDays.push(r);
    } else {
      allNonRecordDays.push(r);
      if (isWorkoutDay) {
        nonRecordWorkoutDays.push(r);
      }
    }
  }

  const useWorkoutBaseline = nonRecordWorkoutDays.length >= MIN_GROUP_DAYS;
  const baselineDays = useWorkoutBaseline
    ? nonRecordWorkoutDays
    : allNonRecordDays;
  const comparisonBaseline: "workout_days" | "all_days" = useWorkoutBaseline
    ? "workout_days"
    : "all_days";
  const baselineName = useWorkoutBaseline
    ? "обычными тренировками"
    : "остальными днями";

  const prevRecordOf = (r: DailyRecord): DailyRecord | undefined => {
    const prevISO = addDaysISO(r.dateISO, -1);
    return prevISO ? lookupByDate.get(prevISO) : undefined;
  };

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
    for (const r of baselineDays) {
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
        lowSample,
        baselineName
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
    for (const r of baselineDays) {
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
        lowSample,
        baselineName
      ),
    });
  };

  // Состояние и сон
  addNumericRow("score", "Оценка дня", "/10", true, (r) => r.score);
  addNumericRow("energy", "Энергия", "/10", true, (r) => r.energy);
  addNumericRow("sleepHours", "Сон", "ч", true, (r) => r.sleepHours);
  addNumericRow("bedtimeHour", "Время отбоя", "ч", false, (r) => r.bedtimeHour);
  addBooleanRateRow(
    "sleepDeprived",
    "Недосып (< 7 ч сна)",
    false,
    (r) => (r.sleepHours !== null ? r.sleepHours < 7 : null)
  );

  // Накануне (-1 день): восстановление и топливо перед тренировкой
  addNumericRow("prev_sleepHours", "Сон накануне", "ч", true, (r) => prevRecordOf(r)?.sleepHours ?? null);
  addNumericRow("prev_calories", "Калории накануне", "ккал", true, (r) => prevRecordOf(r)?.calories ?? null);
  addNumericRow("prev_carbs", "Углеводы накануне", "г", true, (r) => prevRecordOf(r)?.carbs ?? null);
  addNumericRow("prev_protein", "Белки накануне", "г", true, (r) => prevRecordOf(r)?.protein ?? null);
  addNumericRow("prev_focusHours", "Фокус накануне", "ч", true, (r) => prevRecordOf(r)?.focusHours ?? null);

  // Объём самой тренировки
  addNumericRow("workoutDurationMin", "Длительность тренировки", "мин", true, (r) => r.workoutDurationMin);
  addNumericRow("workoutSetsCount", "Подходов за тренировку", "подх.", true, (r) => r.workoutSetsCount);
  addNumericRow("workoutTotalReps", "Повторений за тренировку", "повт.", true, (r) => r.workoutTotalReps);
  addNumericRow("workoutTonnageKg", "Тоннаж доп. веса", "кг", true, (r) => r.workoutTonnageKg);

  // Питание, вес и активность дня
  addNumericRow("calories", "Калории", "ккал", true, (r) => r.calories);
  addNumericRow("protein", "Белки", "г", true, (r) => r.protein);
  addNumericRow("fats", "Жиры", "г", true, (r) => r.fats);
  addNumericRow("carbs", "Углеводы", "г", true, (r) => r.carbs);
  addNumericRow("weight", "Вес тела", "кг", true, (r) => r.weight);
  addNumericRow("focusHours", "Глубокая работа", "ч", true, (r) => r.focusHours);
  addNumericRow("dayProgressPct", "План дня", "%", true, (r) => r.dayProgressPct);
  addNumericRow("steps", "Шаги", "шаг", true, (r) => r.steps);
  addNumericRow("pagesRead", "Чтение", "стр", true, (r) => r.pagesRead);
  addNumericRow("srCardsReviewed", "SR-карточки", "шт", true, (r) => r.srCardsReviewed);
  addNumericRow("grammarExercises", "Грамматика", "упр.", true, (r) => r.grammarExercises);
  addNumericRow("socialMinutes", "Скроллинг соцсетей", "мин", false, (r) => r.socialMinutes);
  addNumericRow("screenHours", "Экранное время", "ч", false, (r) => r.screenHours);
  addNumericRow("valuesActionsCount", "Ценностные действия", "шт", true, (r) => r.valuesActionsCount);

  addBooleanRateRow("habit_nofap", "Привычка: NoFap", true, (r) => r.habits.nofap);
  addBooleanRateRow("habit_sleep", "Привычка: Режим сна", true, (r) => r.habits.режим_сна);
  addBooleanRateRow("habit_diet", "Привычка: Диета", true, (r) => r.habits.диета);
  addBooleanRateRow("habit_nosocial", "Привычка: Без соцсетей", true, (r) => r.habits.без_соцсетей);
  addBooleanRateRow("habit_reading", "Привычка: Чтение", true, (r) => r.habits.чтение);
  addBooleanRateRow("habit_savoring", "Привычка: Момент присутствия", true, (r) => r.habits.момент_присутствия);

  return {
    totalRecordDaysInPeriod: recordDays.length,
    totalWorkoutDaysInPeriod,
    totalBaselineDaysInPeriod: baselineDays.length,
    comparisonBaseline,
    lowSampleOverall:
      recordDays.length < MIN_GROUP_DAYS || baselineDays.length < MIN_GROUP_DAYS,
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
        const valX = r[spec.leftKey as NumericMetricKey];
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
  const allRecordsByDate = new Map<string, DailyRecord>(
    records.map((r) => [r.dateISO, r])
  );
  const sortedDesc = [...records].sort((a, b) =>
    b.dateISO.localeCompare(a.dateISO)
  );
  const slice = limitDays > 0 ? sortedDesc.slice(0, limitDays) : sortedDesc;

  // ─── 1. Парные связи по белому списку осмысленных пар ───────────────────
  const { correlations, insufficientCount } = evaluateWhitelistedPairs(slice);

  // ─── 2. Влияние привычек внутри дня ─────────────────────────────────────
  const habitImpacts: HabitImpact[] = [];
  const targets: Array<{
    key: TargetMetricKey;
    name: string;
    shortName: string;
    unit: string;
  }> = [
    { key: "score", name: "Оценку дня", shortName: "оценка дня", unit: "балла" },
    { key: "energy", name: "Энергию", shortName: "энергия", unit: "балла" },
    { key: "focusHours", name: "Фокус", shortName: "глубокая работа", unit: "ч" },
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
        const unitSuffix = t.key === "focusHours" ? " ч" : "";

        habitImpacts.push({
          habitKey: hKey,
          habitName: hName,
          targetMetric: t.key,
          avgWhenTrue: round1(avgTrue),
          avgWhenFalse: round1(avgFalse),
          delta,
          countTrue: trueVals.length,
          countFalse: falseVals.length,
          summary: `Наблюдаемая связь: в дни с привычкой среднее ${avgTrue.toFixed(1)}${unitSuffix} против ${avgFalse.toFixed(1)}${unitSuffix} без неё (${sign}${delta.toFixed(1)}${unitSuffix}, n = ${nDays} дн.)`,
        });
      }
    }
  }

  habitImpacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ─── 3. Эффекты на следующий день (привычки + числовые факторы) ─────────
  const lagCandidates: Array<LagImpact & { sortScore: number }> = [];
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
    // 3a. Привычки сегодня -> Оценка / Энергия / Фокус завтра
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

          if (Math.abs(diff) >= 0.25) {
            const isPos = diff > 0;
            const sign = isPos ? "+" : "";
            const unitSuffix = t.key === "focusHours" ? " ч" : "";
            lagCandidates.push({
              factorLabel: `${hName} (сегодня)`,
              targetLabel: `${t.name} (завтра)`,
              deltaOrR: `${sign}${diff.toFixed(1)}${unitSuffix}`,
              isPositive: isPos,
              sampleCount: trueNext.length + falseNext.length,
              description: `Наблюдаемая связь на следующий день: среднее ${avgTrue.toFixed(1)} против ${avgFalse.toFixed(1)}`,
              sortScore: Math.abs(diff),
            });
          }
        }
      }
    }

    // 3b. Числовые факторы сегодня -> метрики завтра (Спирмен)
    const numericLagSpecs: Array<{
      curKey: NumericMetricKey;
      curLabel: string;
      nextKey: NumericMetricKey;
      nextLabel: string;
    }> = [
      { curKey: "focusHours", curLabel: "Фокус", nextKey: "energy", nextLabel: "Энергия" },
      { curKey: "focusHours", curLabel: "Фокус", nextKey: "focusHours", nextLabel: "Фокус" },
      { curKey: "bedtimeHour", curLabel: "Отбой", nextKey: "energy", nextLabel: "Энергия" },
      { curKey: "bedtimeHour", curLabel: "Отбой", nextKey: "focusHours", nextLabel: "Фокус" },
      { curKey: "socialMinutes", curLabel: "Соцсети", nextKey: "focusHours", nextLabel: "Фокус" },
      { curKey: "socialMinutes", curLabel: "Соцсети", nextKey: "energy", nextLabel: "Энергия" },
      { curKey: "screenHours", curLabel: "Экран", nextKey: "sleepHours", nextLabel: "Сон" },
      { curKey: "workoutSetsCount", curLabel: "Подходы трен.", nextKey: "energy", nextLabel: "Энергия" },
      { curKey: "workoutTonnageKg", curLabel: "Тоннаж трен.", nextKey: "energy", nextLabel: "Энергия" },
      { curKey: "dayProgressPct", curLabel: "План дня", nextKey: "score", nextLabel: "Оценка" },
      { curKey: "valuesActionsCount", curLabel: "Ценности", nextKey: "score", nextLabel: "Оценка" },
      { curKey: "pagesRead", curLabel: "Чтение", nextKey: "sleepHours", nextLabel: "Сон" },
    ];

    for (const spec of numericLagSpecs) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const { cur, next } of consecutivePairs) {
        const x = cur[spec.curKey];
        const y = next[spec.nextKey];
        if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length < 10) continue;
      const rVal = spearmanCorrelation(xs, ys);
      if (rVal === null || Math.abs(rVal) < MIN_SIGNIFICANT_R) continue;
      const roundedR = Math.round(rVal * 100) / 100;
      const sign = roundedR > 0 ? "+" : "";
      lagCandidates.push({
        factorLabel: `${spec.curLabel} (сегодня)`,
        targetLabel: `${spec.nextLabel} (завтра)`,
        deltaOrR: `r = ${sign}${roundedR.toFixed(2)}`,
        isPositive: roundedR > 0,
        sampleCount: xs.length,
        description: `Корреляция Спирмена на следующий день · n = ${xs.length} парных дней`,
        sortScore: Math.abs(roundedR) * 2,
      });
    }
  }

  lagCandidates.sort((a, b) => b.sortScore - a.sortScore);
  const lagImpacts: LagImpact[] = lagCandidates
    .slice(0, 10)
    .map(({ sortScore: _s, ...rest }) => rest);

  // ─── 4. Сравнение по лимиту соцсетей ────────────────────────────────────
  const socialLimitMin =
    typeof options.socialLimitMin === "number" &&
    Number.isFinite(options.socialLimitMin) &&
    options.socialLimitMin >= 0
      ? options.socialLimitMin
      : SOCIAL_LIMIT_MIN;

  const under: DailyRecord[] = [];
  const over: DailyRecord[] = [];
  for (const r of slice) {
    if (r.socialMinutes === null) continue;
    if (r.socialMinutes <= socialLimitMin) under.push(r);
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
          `При удержании лимита соцсетей (≤${socialLimitMin} мин) средняя ${t.shortName} ` +
          `${comparison} на ${signedText} ${t.unit} ` +
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

  // ─── 6. Сравнение «Дни рекордов в тренировках против обычных тренировок» ─
  const recordDaysReport = analyzeRecordDaysComparisons(
    slice,
    options.recordDatesSet ?? new Set<string>(),
    options.workoutDatesSet ?? new Set<string>(),
    allRecordsByDate
  );

  return {
    periodDays: limitDays,
    totalRecords: slice.length,
    topCorrelations: correlations,
    insufficientWhitelistedCount: insufficientCount,
    topHabitImpacts: habitImpacts.slice(0, 12),
    lagImpacts,
    socialLimitInsights,
    socialStats,
    recordDaysReport,
  };
}