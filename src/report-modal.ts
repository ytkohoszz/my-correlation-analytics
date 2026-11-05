import { App, Modal } from "obsidian";
import {
  AnalyticsReport,
  DailyRecord,
  PRComparisonScope,
  PRDayEntry,
  PRLagMode,
  PRMetricCriterion,
} from "./types";
import { analyzeRecords, SOCIAL_LIMIT_MIN } from "./engine";
import { renderScatterPlotSvg } from "./scatter-plot";
import {
  detectWorkoutPRDays,
  formatExerciseVariantLabel,
  r2,
} from "./workout-pr";
import type MyCorrelationAnalyticsPlugin from "./main";

function isSocialMetric(label: string): boolean {
  return /соцсет/i.test(label);
}

function formatDateShortRu(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export class CorrelationReportModal extends Modal {
  private plugin: MyCorrelationAnalyticsPlugin;
  private allRecords: DailyRecord[];
  private currentDays: number = 30;
  private expandedCorrelationId: string | null = null;

  private prCriterion: PRMetricCriterion;
  private prLagMode: PRLagMode;
  private prComparisonScope: PRComparisonScope;
  private prDaysByDate: Map<string, PRDayEntry> = new Map();
  private workoutDatesSet: Set<string> = new Set();

  constructor(
    app: App,
    plugin: MyCorrelationAnalyticsPlugin,
    allRecords: DailyRecord[],
    initialDays: number = 30
  ) {
    super(app);
    this.plugin = plugin;
    this.allRecords = allRecords;
    this.currentDays = initialDays;
    this.prCriterion = plugin.settings.prCriterion;
    this.prLagMode = plugin.settings.prLagMode;
    this.prComparisonScope = plugin.settings.prComparisonScope;
  }

  async onOpen(): Promise<void> {
    const { modalEl } = this;
    modalEl.addClass("mod-correlation-report");
    await this.reloadPRHistory();
    this.renderModal();
  }

  private async reloadPRHistory(): Promise<void> {
    const scan = await detectWorkoutPRDays(
      this.app,
      this.plugin.settings.workoutsFolder,
      this.prCriterion
    );
    this.prDaysByDate = scan.prDaysByDate;
    this.workoutDatesSet = scan.workoutDatesSet;
  }

  private renderModal(): void {
    const { contentEl } = this;
    contentEl.empty();

    const report: AnalyticsReport = analyzeRecords(
      this.allRecords,
      this.currentDays,
      {
        prDaysByDate: this.prDaysByDate,
        workoutDatesSet: this.workoutDatesSet,
        prCriterion: this.prCriterion,
        prLagMode: this.prLagMode,
        prComparisonScope: this.prComparisonScope,
      }
    );

    // ── Шапка и переключатель периодов ──────────────────────────────────────
    const head = contentEl.createDiv({ cls: "mca-head" });
    const titleRow = head.createDiv({ cls: "mca-title-row" });
    titleRow.createEl("h2", { text: "📊 Аналитика корреляций ежедневника" });

    const tabsRow = head.createDiv({ cls: "mca-tabs-row" });
    const periods: Array<{ days: number; label: string }> = [
      { days: 30, label: "30 дней" },
      { days: 90, label: "90 дней" },
      { days: 0, label: "Все время" },
    ];

    periods.forEach((p) => {
      const isAct = this.currentDays === p.days;
      const tabBtn = tabsRow.createEl("button", {
        cls: `mca-tab-btn ${isAct ? "is-active" : ""}`,
        text: p.label,
        attr: { type: "button" },
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
      text: `Выборка: ${report.totalRecords} дн. ежедневника · Тренировочных дней за период: ${report.prReport.totalWorkoutDaysInPeriod} · Дней с рекордом: ${report.prReport.totalPRDaysInPeriod}`,
    });

    // ── НОВЫЙ БЛОК: Дни рекордов (PR) vs Остальные дни ──────────────────────
    this.renderPRSection(contentEl, report);

    // ── Блок: сводка по скроллингу соцсетей ────────────────────────────────
    if (report.socialStats.daysTracked > 0) {
      contentEl.createEl("h3", {
        text: "📱 Скроллинг соцсетей (сводка за период)",
        cls: "mca-sec-title",
      });
      const socialPanel = contentEl.createDiv({
        cls: "mca-card mca-social-panel",
      });
      const s = report.socialStats;

      const rowAvg = socialPanel.createDiv({ cls: "mca-card-top" });
      rowAvg.createSpan({
        cls: "mca-card-label",
        text: `Среднее время скроллинга (${s.daysTracked} дн.)`,
      });
      rowAvg.createSpan({
        cls: "mca-delta-badge",
        text: `${s.avgSocialMinutes?.toFixed(1) ?? "—"} мин`,
      });

      socialPanel.createDiv({
        cls: "mca-card-desc",
        text:
          `🛡️ Дней в пределах лимита (≤${SOCIAL_LIMIT_MIN} мин): ` +
          `${s.daysWithinLimit} из ${s.daysTracked} (${s.percentWithinLimit}%) · ` +
          `Максимум за день: ${s.maxSocialMinutes ?? "—"} мин`,
      });
    }

    // ── Блок: влияние превышения лимита соцсетей ───────────────────────────
    if (report.socialLimitInsights.length > 0) {
      contentEl.createEl("h3", {
        text: `🛡️ Влияние превышения лимита соцсетей (>${SOCIAL_LIMIT_MIN} мин)`,
        cls: "mca-sec-title",
      });
      const socialGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

      report.socialLimitInsights.forEach((item) => {
        const card = socialGrid.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({
          cls: "mca-card-label",
          text: `📱 Соцсети → ${item.metric === "score" ? "Оценка" : "Энергия"}`,
        });
        topRow.createSpan({
          cls: `mca-delta-badge ${item.delta > 0 ? "is-up" : "is-down"}`,
          text: (item.delta > 0 ? "+" : "") + item.delta.toFixed(1),
        });
        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // ── Блок 1: привычки внутри дня ────────────────────────────────────────
    contentEl.createEl("h3", {
      text: "⚡ Наблюдаемые различия привычек (в тот же день)",
      cls: "mca-sec-title",
    });
    const habitsGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topHabitImpacts.length === 0) {
      habitsGrid.createDiv({
        cls: "mca-empty",
        text: "Недостаточно данных для сравнения привычек за выбранный период.",
      });
    } else {
      report.topHabitImpacts.forEach((item) => {
        const card = habitsGrid.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });

        const isSocialHabit = item.habitKey === "без_соцсетей";
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocialHabit ? "📱 " : ""}${item.habitName} → ${
            item.targetMetric === "score" ? "Оценка" : "Энергия"
          }`,
        });

        const isPositive = item.delta > 0;
        topRow.createSpan({
          cls: `mca-delta-badge ${isPositive ? "is-up" : "is-down"}`,
          text: (isPositive ? "+" : "") + item.delta.toFixed(1),
        });

        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // ── Блок 2: лаг-эффекты ────────────────────────────────────────────────
    contentEl.createEl("h3", {
      text: "⏳ Отложенные эффекты (на следующий день t → t+1)",
      cls: "mca-sec-title",
    });
    const lagGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.lagImpacts.length === 0) {
      lagGrid.createDiv({
        cls: "mca-empty",
        text: "Недостаточно пар последовательных дней для расчёта лаг-эффекта.",
      });
    } else {
      report.lagImpacts.forEach((lag) => {
        const card = lagGrid.createDiv({ cls: "mca-card is-lag-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });

        const isSocial =
          isSocialMetric(lag.factorLabel) || isSocialMetric(lag.targetLabel);
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocial ? "📱 " : ""}${lag.factorLabel} → ${lag.targetLabel}`,
        });

        topRow.createSpan({
          cls: `mca-delta-badge ${lag.isPositive ? "is-up" : "is-down"}`,
          text: lag.deltaOrR,
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${lag.description} (${lag.sampleCount} пар дней)`,
        });
      });
    }

    // ── Блок 3: корреляции + scatter plot ─────────────────────────────────
    contentEl.createEl("h3", {
      text: "📈 Связи показателей (нажми для графика рассеяния)",
      cls: "mca-sec-title",
    });
    const corrGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topCorrelations.length === 0) {
      corrGrid.createDiv({
        cls: "mca-empty",
        text: "Заметных линейных корреляций за этот период не выявлено.",
      });
    } else {
      report.topCorrelations.forEach((item) => {
        const isExpanded = this.expandedCorrelationId === item.id;
        const card = corrGrid.createDiv({
          cls: `mca-card is-interactive ${isExpanded ? "is-expanded" : ""}`,
        });

        const topRow = card.createDiv({ cls: "mca-card-top" });
        const isSocial =
          isSocialMetric(item.metricA) || isSocialMetric(item.metricB);
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocial ? "📱 " : ""}${item.label}`,
        });

        topRow.createSpan({
          cls: "mca-delta-badge",
          text: `r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`,
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${item.interpretation} (${item.sampleCount} дн.) · ${
            isExpanded ? "свернуть ▲" : "график ▾"
          }`,
        });

        card.onclick = () => {
          this.expandedCorrelationId = isExpanded ? null : item.id;
          this.renderModal();
        };

        if (isExpanded) {
          const plotHost = card.createDiv({ cls: "mca-plot-host" });
          plotHost.onclick = (e) => e.stopPropagation();
          const svg = renderScatterPlotSvg(
            item.points,
            item.metricA,
            item.metricB,
            item.r
          );
          plotHost.appendChild(svg);
        }
      });
    }
  }

  private renderPRSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const pr = report.prReport;

    container.createEl("h3", {
      text: "🏆 Дни рекордов в тренировках (PR) vs Остальные дни",
      cls: "mca-sec-title",
    });

    const prBox = container.createDiv({ cls: "mca-pr-box" });

    // Панель переключателей: Лаг (Тот же день / Накануне), Критерий рекорда и База сравнения
    const controlsRow = prBox.createDiv({ cls: "mca-pr-controls" });

    const lagGroup = controlsRow.createDiv({ cls: "mca-pr-seg" });
    const lagOptions: Array<{ mode: PRLagMode; label: string }> = [
      { mode: "same_day", label: "В день рекорда (t)" },
      { mode: "prev_day", label: "Накануне рекорда (t−1)" },
    ];
    lagOptions.forEach((opt) => {
      const btn = lagGroup.createEl("button", {
        cls: `mca-tab-btn ${this.prLagMode === opt.mode ? "is-active" : ""}`,
        text: opt.label,
        attr: { type: "button" },
      });
      btn.onclick = async () => {
        if (this.prLagMode === opt.mode) return;
        this.prLagMode = opt.mode;
        this.plugin.settings.prLagMode = opt.mode;
        await this.plugin.saveSettingsData();
        this.renderModal();
      };
    });

    const scopeSelect = controlsRow.createEl("select", {
      cls: "dropdown mca-pr-select",
      attr: { title: "С какими днями сравнивать дни рекордов" },
    });
    const scopes: Array<{ id: PRComparisonScope; label: string }> = [
      { id: "all_days", label: "vs Все дни без рекорда" },
      { id: "workout_days", label: "vs Тренировочные дни без рекорда" },
    ];
    scopes.forEach((sc) => {
      const o = scopeSelect.createEl("option", {
        value: sc.id,
        text: sc.label,
      });
      if (this.prComparisonScope === sc.id) o.selected = true;
    });
    scopeSelect.onchange = async () => {
      this.prComparisonScope = scopeSelect.value as PRComparisonScope;
      this.plugin.settings.prComparisonScope = this.prComparisonScope;
      await this.plugin.saveSettingsData();
      this.renderModal();
    };

    const critSelect = controlsRow.createEl("select", {
      cls: "dropdown mca-pr-select",
      attr: { title: "Критерий засчитывания рекорда (первый подход всегда стартовая точка)" },
    });
    const criteria: Array<{ id: PRMetricCriterion; label: string }> = [
      { id: "max_reps", label: "Критерий: Макс. повторы на весе" },
      { id: "total_volume", label: "Критерий: Суммарный объём на весе" },
      { id: "max_weight", label: "Критерий: Макс. доп. вес" },
      { id: "any", label: "Критерий: Любой рекорд" },
    ];
    criteria.forEach((c) => {
      const o = critSelect.createEl("option", { value: c.id, text: c.label });
      if (this.prCriterion === c.id) o.selected = true;
    });
    critSelect.onchange = async () => {
      this.prCriterion = critSelect.value as PRMetricCriterion;
      this.plugin.settings.prCriterion = this.prCriterion;
      await this.plugin.saveSettingsData();
      await this.reloadPRHistory();
      this.renderModal();
    };

    if (pr.lowSampleOverall) {
      prBox.createDiv({
        cls: "mca-pr-warning",
        text: `⚠️ Описательное сравнение (низкая выборка: дней с рекордом — ${pr.totalPRDaysInPeriod}, дней для сравнения — ${pr.totalComparisonDaysInPeriod}). Для статистической надёжности нужно минимум по 3 дня в каждой группе.`,
      });
    }

    if (pr.totalPRDaysInPeriod === 0 || pr.rows.length === 0) {
      prBox.createDiv({
        cls: "mca-empty",
        text: "За выбранный период новых рекордов (превышающих стартовую базу) не зафиксировано. Попробуй переключить период на «90 дней» или «Все время».",
      });
      return;
    }

    // Сводная таблица «В дни рекордов vs В остальные дни»
    const tableWrap = prBox.createDiv({ cls: "mca-pr-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "mca-pr-table" });
    const thead = table.createEl("thead");
    const trH = thead.createEl("tr");
    trH.createEl("th", {
      text:
        this.prLagMode === "prev_day"
          ? "Метрика (накануне t−1)"
          : "Метрика (в день t)",
    });
    trH.createEl("th", { text: "Дни рекордов" });
    trH.createEl("th", {
      text:
        this.prComparisonScope === "workout_days"
          ? "Трен. дни без PR"
          : "Остальные дни",
    });
    trH.createEl("th", { text: "Разница (Δ)" });
    trH.createEl("th", { text: "Выборка (PR / Ост.)" });

    const tbody = table.createEl("tbody");
    for (const row of pr.rows) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { cls: "mca-pr-td-name", text: row.label });

      const fmtVal = (val: number | null) => {
        if (val === null) return "—";
        if (row.kind === "habit_pct") return `${Math.round(val)}%`;
        return `${r2(val).toLocaleString("ru-RU")} ${row.unit}`;
      };

      tr.createEl("td", {
        cls: "mca-pr-td-num",
        text: fmtVal(row.avgPR),
      });
      tr.createEl("td", {
        cls: "mca-pr-td-num",
        text: fmtVal(row.avgOther),
      });

      const tdDelta = tr.createEl("td", { cls: "mca-pr-td-delta" });
      if (row.delta === null) {
        tdDelta.setText("—");
      } else {
        const sign = row.delta > 0 ? "+" : "";
        const unitSuffix = row.kind === "habit_pct" ? " п.п." : ` ${row.unit}`;
        const isGood =
          row.delta === 0
            ? null
            : row.higherIsBetter
              ? row.delta > 0
              : row.delta < 0;
        const badge = tdDelta.createSpan({
          cls:
            "mca-delta-badge" +
            (isGood === true ? " is-up" : isGood === false ? " is-down" : ""),
          text: `${sign}${r2(row.delta).toLocaleString("ru-RU")}${unitSuffix}`,
        });
        if (row.lowSample) {
          badge.setAttribute("title", "Низкая выборка (< 3 дней в одной из групп)");
        }
      }

      const tdSample = tr.createEl("td", { cls: "mca-pr-td-sample" });
      tdSample.setText(
        `${row.countPR} / ${row.countOther} дн.${row.lowSample ? " ⚠️ малая" : ""}`
      );
    }

    // Список дней рекордов с перечнем упражнений
    const details = prBox.createEl("details", { cls: "mca-pr-days-details" });
    details.open = true;
    details.createEl("summary", {
      cls: "mca-pr-days-summary",
      text: `Журнал дней рекордов за период (${pr.prDays.length} дн.)`,
    });

    const daysList = details.createDiv({ cls: "mca-pr-days-list" });
    for (const dayEntry of pr.prDays) {
      const row = daysList.createDiv({ cls: "mca-pr-day-row" });
      const dateLink = row.createEl("a", {
        cls: "internal-link mca-pr-day-date",
        text: formatDateShortRu(dayEntry.dateISO),
        attr: { href: dayEntry.workoutPath },
      });
      dateLink.onclick = (e) => {
        e.preventDefault();
        this.close();
        void this.app.workspace.openLinkText(dayEntry.workoutPath, "", false);
      };

      const badgesWrap = row.createDiv({ cls: "mca-pr-day-events" });
      for (const ev of dayEntry.events) {
        const varLabel = formatExerciseVariantLabel(
          ev.exerciseName,
          ev.variant,
          ev.loadType,
          ev.weight
        );
        let achievementText = "";
        if (ev.criterionTriggered === "max_weight") {
          achievementText = `новый вес +${r2(ev.newValue)} кг (пред. +${r2(ev.previousBest)} кг)`;
        } else if (ev.criterionTriggered === "total_volume") {
          achievementText = `объём ${r2(ev.newValue)} ${ev.unit} (пред. ${r2(ev.previousBest)} · подходы: ${ev.setsSummary})`;
        } else {
          achievementText = `${r2(ev.newValue)} ${ev.unit} (пред. ${r2(ev.previousBest)} · подходы: ${ev.setsSummary})`;
        }

        badgesWrap.createSpan({
          cls: "mca-pr-event-pill",
          text: `🥇 ${varLabel}: ${achievementText}`,
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
