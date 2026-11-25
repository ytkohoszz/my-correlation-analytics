import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { collectDailyRecords, readValuesCompassIndex } from "./data-collector";
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
  const rawLimit = Number(s["socialLimitMin"]);
  const socialLimitMin =
    Number.isFinite(rawLimit) && rawLimit >= 0 && rawLimit <= 1440
      ? Math.round(rawLimit)
      : DEFAULT_SETTINGS.socialLimitMin;

  return {
    diaryFolder:
      typeof s["diaryFolder"] === "string" && s["diaryFolder"].trim()
        ? s["diaryFolder"].trim()
        : DEFAULT_SETTINGS.diaryFolder,
    workoutsFolder:
      typeof s["workoutsFolder"] === "string" && s["workoutsFolder"].trim()
        ? s["workoutsFolder"].trim()
        : DEFAULT_SETTINGS.workoutsFolder,
    socialLimitMin,
    valuesCompassPath:
      typeof s["valuesCompassPath"] === "string" && s["valuesCompassPath"].trim()
        ? s["valuesCompassPath"].trim()
        : DEFAULT_SETTINGS.valuesCompassPath,
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
      .setName("Лимит соцсетей (мин/день)")
      .setDesc("Порог для привычки «Без соцсетей» и сравнения дней в лимите / сверх лимита. По умолчанию: 30")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "1440";
        text
          .setValue(String(this.plugin.settings.socialLimitMin))
          .onChange(async (val) => {
            const parsed = Number(val.trim());
            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440) {
              this.plugin.settings.socialLimitMin = Math.round(parsed);
              await this.plugin.saveSettingsData();
            }
          });
      });

    new Setting(containerEl)
      .setName("Файл данных «Ценностей»")
      .setDesc("Путь к JSON-базе my-values-compass. По умолчанию: _system/values-compass.json")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.valuesCompassPath)
          .onChange(async (val) => {
            this.plugin.settings.valuesCompassPath =
              val.trim() || DEFAULT_SETTINGS.valuesCompassPath;
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
    return collectDailyRecords(this.app, this.settings.diaryFolder, {
      socialLimitMin: this.settings.socialLimitMin,
    });
  }

  public async getRawRecordsAsync(): Promise<DailyRecord[]> {
    const valuesIndex = await readValuesCompassIndex(
      this.app,
      this.settings.valuesCompassPath
    );
    return collectDailyRecords(this.app, this.settings.diaryFolder, {
      socialLimitMin: this.settings.socialLimitMin,
      valuesIndex,
    });
  }

  public async getReportAsync(days: number = 30): Promise<AnalyticsReport> {
    const [records, scan] = await Promise.all([
      this.getRawRecordsAsync(),
      detectWorkoutRecordDays(this.app, this.settings.workoutsFolder),
    ]);
    return analyzeRecords(records, days, {
      recordDatesSet: new Set(scan.recordDaySummariesByDate.keys()),
      workoutDatesSet: scan.workoutDatesSet,
      socialLimitMin: this.settings.socialLimitMin,
    });
  }

  public getReport(days: number = 30): AnalyticsReport {
    const records = this.getRawRecords();
    return analyzeRecords(records, days, {
      socialLimitMin: this.settings.socialLimitMin,
    });
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
