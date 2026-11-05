import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { collectDailyRecords } from "./data-collector";
import { analyzeRecords } from "./engine";
import { CorrelationReportModal } from "./report-modal";
import {
  AnalyticsReport,
  CorrelationAnalyticsSettings,
  DailyRecord,
  DEFAULT_SETTINGS,
} from "./types";
import {
  detectWorkoutRecordDays,
  syncRecordFlagsToDiaryFrontmatter,
} from "./workout-pr";

function migrateSettings(raw: unknown): CorrelationAnalyticsSettings {
  const s =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  return {
    diaryFolder:
      typeof s["diaryFolder"] === "string" && s["diaryFolder"].trim()
        ? s["diaryFolder"].trim()
        : DEFAULT_SETTINGS.diaryFolder,
    workoutsFolder:
      typeof s["workoutsFolder"] === "string" && s["workoutsFolder"].trim()
        ? s["workoutsFolder"].trim()
        : DEFAULT_SETTINGS.workoutsFolder,
  };
}

class CorrelationSettingTab extends PluginSettingTab {
  plugin: MyCorrelationAnalyticsPlugin;

  constructor(app: App, plugin: MyCorrelationAnalyticsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Аналитика корреляций и рекордов" });

    new Setting(containerEl)
      .setName("Папка ежедневника")
      .setDesc("По умолчанию: Ежедневник")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.diaryFolder)
          .onChange(async (val) => {
            this.plugin.settings.diaryFolder =
              val.trim() || DEFAULT_SETTINGS.diaryFolder;
            await this.plugin.saveSettingsData();
          })
      );

    new Setting(containerEl)
      .setName("Папка тренировок")
      .setDesc("По умолчанию: Знания (файлы с типом «Тренировка»)")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.workoutsFolder)
          .onChange(async (val) => {
            this.plugin.settings.workoutsFolder =
              val.trim() || DEFAULT_SETTINGS.workoutsFolder;
            await this.plugin.saveSettingsData();
          })
      );

    new Setting(containerEl)
      .setName("Записать метки рекордов в свойства ежедневника (необязательно)")
      .setDesc(
        "Аналитика вычисляет дни рекордов на лету без изменения заметок. Эта кнопка при желании пропишет «рекорд_тренировки: true» и «рекорды_упражнений» в заметки ежедневника через processFrontMatter"
      )
      .addButton((btn) =>
        btn.setButtonText("Записать в ежедневник").onClick(async () => {
          btn.setDisabled(true);
          try {
            const scan = await detectWorkoutRecordDays(
              this.app,
              this.plugin.settings.workoutsFolder
            );
            const count = await syncRecordFlagsToDiaryFrontmatter(
              this.app,
              this.plugin.settings.diaryFolder,
              scan.recordDaySummariesByDate
            );
            new Notice(`Обновлено заметок ежедневника с рекордами: ${count}`);
          } finally {
            btn.setDisabled(false);
          }
        })
      );
  }
}

export default class MyCorrelationAnalyticsPlugin extends Plugin {
  public settings: CorrelationAnalyticsSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettingsData();
    this.addSettingTab(new CorrelationSettingTab(this.app, this));

    this.addRibbonIcon("trending-up", "Дневник: Аналитика корреляций", () => {
      this.openAnalyticsReport();
    });

    this.addCommand({
      id: "run-correlation-analytics",
      name: "Дневник: Рассчитать корреляции привычек и рекордов",
      callback: () => {
        this.openAnalyticsReport();
      },
    });

    (window as unknown as Record<string, unknown>).__myCorrelationAnalytics = this;
  }

  onunload(): void {
    delete (window as unknown as Record<string, unknown>).__myCorrelationAnalytics;
  }

  async loadSettingsData(): Promise<void> {
    const raw = await this.loadData();
    this.settings = migrateSettings(raw);
  }

  async saveSettingsData(): Promise<void> {
    await this.saveData(this.settings);
  }

  public getRawRecords(): DailyRecord[] {
    return collectDailyRecords(this.app, this.settings.diaryFolder);
  }

  public async getReportAsync(days: number = 30): Promise<AnalyticsReport> {
    const records = this.getRawRecords();
    const scan = await detectWorkoutRecordDays(
      this.app,
      this.settings.workoutsFolder
    );
    return analyzeRecords(records, days, {
      recordDatesSet: new Set(scan.recordDaySummariesByDate.keys()),
      workoutDatesSet: scan.workoutDatesSet,
    });
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
    new CorrelationReportModal(this.app, this, records, days).open();
  }
}
