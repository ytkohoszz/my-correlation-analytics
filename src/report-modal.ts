import { App, Modal } from "obsidian";
import { AnalyticsReport } from "./types";

export class CorrelationReportModal extends Modal {
  private report: AnalyticsReport;

  constructor(app: App, report: AnalyticsReport) {
    super(app);
    this.report = report;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("mod-correlation-report");
    contentEl.empty();

    const title = contentEl.createDiv({ cls: "mca-head" });
    title.createEl("h2", { text: "📊 Аналитика корреляций ежедневника" });
    title.createSpan({
      cls: "mca-sub",
      text: `За последние ${this.report.periodDays} дней (${this.report.totalRecords} записей)`
    });

    // 1. Секция влияния привычек
    contentEl.createEl("h3", { text: "⚡ Влияние привычек на самочувствие", cls: "mca-sec-title" });
    const habitsBox = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (this.report.topHabitImpacts.length === 0) {
      habitsBox.createDiv({ cls: "mca-empty", text: "Недостаточно данных для сравнения привычек." });
    } else {
      this.report.topHabitImpacts.forEach(item => {
        const card = habitsBox.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({ cls: "mca-card-label", text: `${item.habitName} → ${item.targetMetric === "score" ? "Оценка" : "Энергия"}` });

        const isPositive = item.delta > 0;
        const deltaBadge = topRow.createSpan({
          cls: `mca-delta-badge ${isPositive ? "is-up" : "is-down"}`,
          text: (isPositive ? "+" : "") + item.delta.toFixed(1)
        });

        card.createDiv({ cls: "mca-card-desc", text: item.summary });
      });
    }

    // 2. Секция парных корреляций
    contentEl.createEl("h3", { text: "📈 Взаимосвязи числовых показателей (Пирсон r)", cls: "mca-sec-title" });
    const corrBox = contentEl.createDiv({ cls: "mca-cards-grid" });

    if (this.report.topCorrelations.length === 0) {
      corrBox.createDiv({ cls: "mca-empty", text: "Заметных линейных корреляций пока не выявлено." });
    } else {
      this.report.topCorrelations.forEach(item => {
        const card = corrBox.createDiv({ cls: "mca-card" });
        const topRow = card.createDiv({ cls: "mca-card-top" });
        topRow.createSpan({ cls: "mca-card-label", text: item.label });

        const rBadge = topRow.createSpan({
          cls: "mca-delta-badge",
          text: `r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`
        });

        card.createDiv({ cls: "mca-card-desc", text: `${item.interpretation} (${item.sampleCount} совпадений)` });
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}