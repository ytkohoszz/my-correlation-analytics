import { Plugin, Notice } from "obsidian";
import { collectDailyRecords } from "./data-collector";
import { analyzeRecords } from "./engine";
import { CorrelationReportModal } from "./report-modal";
import { AnalyticsReport } from "./types";

export default class MyCorrelationAnalyticsPlugin extends Plugin {
  async onload(): Promise<void> {
    // 1. Иконка в левой панели (Ribbon)
    this.addRibbonIcon("trending-up", "Дневник: Аналитика корреляций", () => {
      this.openAnalyticsReport();
    });

    // 2. Команда в палитре (Ctrl/Cmd+P)
    this.addCommand({
      id: "run-correlation-analytics",
      name: "Дневник: Рассчитать корреляции привычек",
      callback: () => {
        this.openAnalyticsReport();
      }
    });

    // Регистрация API для будущего вызова из diary.js
    (window as unknown as Record<string, unknown>).__myCorrelationAnalytics = this;
  }

  onunload(): void {
    delete (window as unknown as Record<string, unknown>).__myCorrelationAnalytics;
  }

  public getReport(days: number = 30): AnalyticsReport {
    const records = collectDailyRecords(this.app);
    return analyzeRecords(records, days);
  }

  public openAnalyticsReport(days: number = 30): void {
    const report = this.getReport(days);
    if (report.totalRecords < 4) {
      new Notice("В папке «Ежедневник» найдено меньше 4 записей с датами.");
      return;
    }
    new CorrelationReportModal(this.app, report).open();
  }
}