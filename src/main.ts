import { Plugin, Notice } from "obsidian";
import { collectDailyRecords } from "./data-collector";
import { analyzeRecords } from "./engine";
import { CorrelationReportModal } from "./report-modal";
import { AnalyticsReport, DailyRecord } from "./types";

export default class MyCorrelationAnalyticsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.addRibbonIcon("trending-up", "Дневник: Аналитика корреляций", () => {
      this.openAnalyticsReport();
    });

    this.addCommand({
      id: "run-correlation-analytics",
      name: "Дневник: Рассчитать корреляции привычек",
      callback: () => {
        this.openAnalyticsReport();
      }
    });

    (window as unknown as Record<string, unknown>).__myCorrelationAnalytics = this;
  }

  onunload(): void {
    delete (window as unknown as Record<string, unknown>).__myCorrelationAnalytics;
  }

  public getRawRecords(): DailyRecord[] {
    return collectDailyRecords(this.app);
  }

  public getReport(days: number = 30): AnalyticsReport {
    const records = this.getRawRecords();
    return analyzeRecords(records, days);
  }

  public openAnalyticsReport(days: number = 30): void {
    const records = this.getRawRecords();
    if (records.length < 4) {
      new Notice("В папке «Ежедневник» найдено меньше 4 записей с датами.");
      return;
    }
    new CorrelationReportModal(this.app, records, days).open();
  }
}