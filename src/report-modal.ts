// src/report-modal.ts
import { App, Modal } from "obsidian";
import { AnalyticsReport, DailyRecord } from "./types";
import {
  analyzeRecords,
  DEFAULT_VISIBLE_CORRELATIONS,
  MIN_PAIR_SAMPLE,
  MIN_SIGNIFICANT_R,
  SOCIAL_LIMIT_MIN,
} from "./engine";
import { renderScatterPlotSvg } from "./scatter-plot";
import { detectWorkoutRecordDays, r2 } from "./workout-pr";
import type MyCorrelationAnalyticsPlugin from "./main";

function isSocialMetric(label: string): boolean {
  return /соцсет/i.test(label);
}

export class CorrelationReportModal extends Modal {
  private plugin: MyCorrelationAnalyticsPlugin;
  private allRecords: DailyRecord[];
  private currentDays: number = 30;
  private expandedCorrelationId: string | null = null;
  private recordDetailsOpen: boolean = false;
  private showAllCorrelations: boolean = false;

  private recordDatesSet: Set<string> = new Set();
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
  }

  async onOpen(): Promise<void> {
    const { modalEl } = this;
    modalEl.addClass("mod-correlation-report");
    await this.reloadWorkoutHistory();
    this.renderModal();
  }

  private async reloadWorkoutHistory(): Promise<void> {
    const scan = await detectWorkoutRecordDays(
      this.app,
      this.plugin.settings.workoutsFolder
    );
    this.recordDatesSet = new Set(scan.recordDaySummariesByDate.keys());
    this.workoutDatesSet = scan.workoutDatesSet;
  }

  private renderModal(): void {
    const { contentEl } = this;
    contentEl.empty();

    const report: AnalyticsReport = analyzeRecords(
      this.allRecords,
      this.currentDays,
      {
        recordDatesSet: this.recordDatesSet,
        workoutDatesSet: this.workoutDatesSet,
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
          this.showAllCorrelations = false;
          this.renderModal();
        }
      };
    });

    head.createDiv({
      cls: "mca-sub",
      text: `Дней в периоде: ${report.totalRecords} · Тренировочных дней: ${report.recordDaysReport.totalWorkoutDaysInPeriod} · Дней с рекордом: ${report.recordDaysReport.totalRecordDaysInPeriod}`,
    });

    // ── Сворачиваемый блок: Дни рекордов в тренировках против остальных дней ─
    this.renderRecordDaysSection(contentEl, report);

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
      text: "⚡ Различия показателей в дни с привычками",
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

    // ── Блок 2: связь со следующим днём ─────────────────────────────────────
    contentEl.createEl("h3", {
      text: "⏳ Связь со следующим днём",
      cls: "mca-sec-title",
    });
    const lagGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.lagImpacts.length === 0) {
      lagGrid.createDiv({
        cls: "mca-empty",
        text: "Недостаточно пар последовательных дней для расчёта.",
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
          text: `${lag.description} (n = ${lag.sampleCount} дн.)`,
        });
      });
    }

    // ── Блок 3: взаимные связи показателей + график ─────────────────────────
    contentEl.createEl("h3", {
      text: "📈 Взаимные связи показателей (нажми для графика)",
      cls: "mca-sec-title",
    });
    const corrGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topCorrelations.length === 0) {
      corrGrid.createDiv({
        cls: "mca-empty",
        text: `Недостаточно данных для надёжной связи (нужно n ≥ ${MIN_PAIR_SAMPLE} парных дней и |r| ≥ ${MIN_SIGNIFICANT_R}). Переключи период на «90 дней» или «Все время».`,
      });
    } else {
      const visibleCorrelations = this.showAllCorrelations
        ? report.topCorrelations
        : report.topCorrelations.slice(0, DEFAULT_VISIBLE_CORRELATIONS);

      visibleCorrelations.forEach((item) => {
        const isExpanded = this.expandedCorrelationId === item.id;
        const isLag = (item.lagDays ?? 0) > 0;
        const card = corrGrid.createDiv({
          cls: `mca-card is-interactive ${isLag ? "is-lag-card" : ""} ${
            isExpanded ? "is-expanded" : ""
          }`,
        });

        const topRow = card.createDiv({ cls: "mca-card-top" });
        const isSocial =
          isSocialMetric(item.metricA) || isSocialMetric(item.metricB);
        topRow.createSpan({
          cls: "mca-card-label",
          text: `${isSocial ? "📱 " : ""}${item.label}`,
        });

        const badgeText =
          item.valueBadge ?? `${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`;
        const isPositive = item.isPositive ?? item.r > 0;
        topRow.createSpan({
          cls: `mca-delta-badge ${isPositive ? "is-up" : "is-down"}`,
          text: badgeText,
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${item.interpretation} · ${
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

      if (report.topCorrelations.length > DEFAULT_VISIBLE_CORRELATIONS) {
        const hiddenCount =
          report.topCorrelations.length - DEFAULT_VISIBLE_CORRELATIONS;
        const moreWrap = contentEl.createDiv({ cls: "mca-more-wrap" });
        const moreBtn = moreWrap.createEl("button", {
          cls: "mca-more-btn",
          text: this.showAllCorrelations
            ? "Свернуть дополнительные связи ▲"
            : `Показать ещё (${hiddenCount}) ▾`,
          attr: { type: "button" },
        });
        moreBtn.onclick = () => {
          this.showAllCorrelations = !this.showAllCorrelations;
          this.renderModal();
        };
      }
    }
  }

  private renderRecordDaysSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const rec = report.recordDaysReport;
    const isOpen = this.recordDetailsOpen;

    const section = container.createDiv({
      cls: `mca-pr-details ${isOpen ? "is-open" : ""}`,
    });

    const headerBtn = section.createEl("button", {
      cls: "mca-pr-summary",
      attr: {
        type: "button",
        "aria-expanded": String(isOpen),
      },
    });

    const titleWrap = headerBtn.createDiv({ cls: "mca-pr-summary-left" });
    titleWrap.createSpan({
      cls: "mca-pr-chevron",
      text: "▸",
      attr: { "aria-hidden": "true" },
    });
    titleWrap.createSpan({
      cls: "mca-pr-summary-title",
      text: "🏆 Дни рекордов в тренировках против остальных дней",
    });

    const collapseWrap = section.createDiv({
      cls: `mca-pr-collapse ${isOpen ? "is-open" : ""}`,
    });
    const collapseInner = collapseWrap.createDiv({
      cls: "mca-pr-collapse-inner",
    });
    const body = collapseInner.createDiv({ cls: "mca-pr-body" });

    headerBtn.onclick = () => {
      this.recordDetailsOpen = !this.recordDetailsOpen;
      section.toggleClass("is-open", this.recordDetailsOpen);
      collapseWrap.toggleClass("is-open", this.recordDetailsOpen);
      headerBtn.setAttribute("aria-expanded", String(this.recordDetailsOpen));
    };

    if (rec.totalRecordDaysInPeriod === 0 || rec.rows.length === 0) {
      body.createDiv({
        cls: "mca-empty",
        text: "За выбранный период дней с новыми рекордами не найдено. Переключи период на «90 дней» или «Все время».",
      });
      return;
    }

    if (rec.lowSampleOverall) {
      body.createDiv({
        cls: "mca-pr-warning",
        text: `⚠️ Мало дней с рекордами за выбранный период (${rec.totalRecordDaysInPeriod} дн.). Таблица ниже показывает простое сравнение средних, но для уверенных выводов нужно хотя бы 3 дня рекордов.`,
      });
    }

    const tableWrap = body.createDiv({ cls: "mca-pr-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "mca-pr-table" });
    const thead = table.createEl("thead");
    const trH = thead.createEl("tr");
    trH.createEl("th", { text: "Показатель" });
    trH.createEl("th", { text: "В дни рекордов" });
    trH.createEl("th", { text: "В остальные дни" });
    trH.createEl("th", { text: "Разница" });
    trH.createEl("th", { text: "Число дней" });

    const tbody = table.createEl("tbody");
    for (const row of rec.rows) {
      const tr = tbody.createEl("tr");

      const tdName = tr.createEl("td", { cls: "mca-pr-td-name" });
      tdName.createDiv({ cls: "mca-pr-metric-title", text: row.label });
      tdName.createDiv({
        cls: `mca-pr-metric-conclusion ${row.lowSample ? "is-low-sample" : ""}`,
        text: row.conclusion,
      });

      const fmtVal = (val: number | null) => {
        if (val === null) return "—";
        if (row.kind === "habit_pct") return `${Math.round(val)}%`;
        return `${r2(val).toLocaleString("ru-RU")} ${row.unit}`;
      };

      tr.createEl("td", {
        cls: "mca-pr-td-num",
        text: fmtVal(row.avgRecordDays),
      });
      tr.createEl("td", {
        cls: "mca-pr-td-num",
        text: fmtVal(row.avgOtherDays),
      });

      const tdDelta = tr.createEl("td", { cls: "mca-pr-td-delta" });
      if (row.delta === null) {
        tdDelta.setText("—");
      } else {
        const sign = row.delta > 0 ? "+" : "";
        const unitSuffix = row.kind === "habit_pct" ? "%" : ` ${row.unit}`;
        const isGood =
          row.delta === 0
            ? null
            : row.higherIsBetter
              ? row.delta > 0
              : row.delta < 0;
        tdDelta.createSpan({
          cls:
            "mca-delta-badge" +
            (isGood === true ? " is-up" : isGood === false ? " is-down" : ""),
          text: `${sign}${r2(row.delta).toLocaleString("ru-RU")}${unitSuffix}`,
        });
      }

      const tdSample = tr.createEl("td", { cls: "mca-pr-td-sample" });
      tdSample.setText(
        `${row.countRecordDays} и ${row.countOtherDays} дн.${
          row.lowSample ? " ⚠️ мало" : ""
        }`
      );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}