import { App, Modal } from "obsidian";
import { AnalyticsReport, DailyRecord } from "./types";
import { analyzeRecords } from "./engine";
import { renderScatterPlotSvg } from "./scatter-plot";

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

    // Шапка и переключатель периодов
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

    // 1. Привычки внутри дня
    contentEl.createEl("h3", { text: "⚡ Наблюдаемые различия привычек (в тот же день)", cls: "mca-sec-title" });
    const habitsGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topHabitImpacts.length === 0) {
      habitsGrid.createDiv({ cls: "mca-empty", text: "Недостаточно данных для сравнения привычек за выбранный период." });
    } else {
      report.topHabitImpacts.forEach(item => {
        const card = habitsGrid.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({ cls: "mca-card-label", text: `${item.habitName} → ${item.targetMetric === "score" ? "Оценка" : "Энергия"}` });

        const isPositive = item.delta > 0;
        topRow.createSpan({
          cls: `mca-delta-badge ${isPositive ? "is-up" : "is-down"}`,
          text: (isPositive ? "+" : "") + item.delta.toFixed(1)
        });

        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // 2. Лаг-анализ: отложенные эффекты на следующий день
    contentEl.createEl("h3", { text: "⏳ Отложенные эффекты (на следующий день t → t+1)", cls: "mca-sec-title" });
    const lagGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.lagImpacts.length === 0) {
      lagGrid.createDiv({ cls: "mca-empty", text: "Недостаточно пар последовательных дней для расчёта лаг-эффекта." });
    } else {
      report.lagImpacts.forEach(lag => {
        const card = lagGrid.createDiv({ cls: "mca-card is-lag-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({ cls: "mca-card-label", text: `${lag.factorLabel} → ${lag.targetLabel}` });

        topRow.createSpan({
          cls: `mca-delta-badge ${lag.isPositive ? "is-up" : "is-down"}`,
          text: lag.deltaOrR
        });

        card.createDiv({ cls: "mca-card-desc", text: `${lag.description} (${lag.sampleCount} пар дней)` });
      });
    }

    // 3. Взаимосвязи показателей и Scatter plot
    contentEl.createEl("h3", { text: "📈 Связи показателей (нажми для графика рассеяния)", cls: "mca-sec-title" });
    const corrGrid = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (report.topCorrelations.length === 0) {
      corrGrid.createDiv({ cls: "mca-empty", text: "Заметных линейных корреляций за этот период не выявлено." });
    } else {
      report.topCorrelations.forEach(item => {
        const isExpanded = this.expandedCorrelationId === item.id;
        const card = corrGrid.createDiv({ cls: `mca-card is-interactive ${isExpanded ? "is-expanded" : ""}` });

        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({ cls: "mca-card-label", text: item.label });

        topRow.createSpan({
          cls: "mca-delta-badge",
          text: `r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`
        });

        card.createDiv({
          cls: "mca-card-desc",
          text: `${item.interpretation} (${item.sampleCount} дн.) · ${isExpanded ? "свернуть ▲" : "график ▾"}`
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