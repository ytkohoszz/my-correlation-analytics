import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  collectDailyRecords,
  FocusFallbackIndex,
  ReadingLogIndex,
  readFocusSectionFallbackIndex,
  readReadingLogIndex,
  readValuesCompassIndex,
  ValuesCompassDailyIndex,
} from "./data-collector";
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
  WorkoutHistoryScanResult,
} from "./workout-pr";

export interface ExternalAnalyticsBundle {
  records: DailyRecord[];
  recordDatesSet: Set<string>;
  workoutDatesSet: Set<string>;
}

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
    readingLogPath:
      typeof s["readingLogPath"] === "string" && s["readingLogPath"].trim()
        ? s["readingLogPath"].trim()
        : DEFAULT_SETTINGS.readingLogPath,
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
      .setName("Журнал чтения (JSON)")
      .setDesc("Резервный источник прочитанных страниц из my-epub-reader. По умолчанию: _system/reading-log.json")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.readingLogPath)
          .onChange(async (val) => {
            this.plugin.settings.readingLogPath =
              val.trim() || DEFAULT_SETTINGS.readingLogPath;
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
  private externalCache: {
    valuesIndex: ValuesCompassDailyIndex;
    readingLogIndex: ReadingLogIndex;
    focusFallbackIndex: FocusFallbackIndex;
    workoutScan: WorkoutHistoryScanResult;
  } | null = null;

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

    this.app.workspace.onLayoutReady(() => {
      void this.refreshExternalCache();
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
    this.externalCache = null;
  }

  private async refreshExternalCache(): Promise<{
    valuesIndex: ValuesCompassDailyIndex;
    readingLogIndex: ReadingLogIndex;
    focusFallbackIndex: FocusFallbackIndex;
    workoutScan: WorkoutHistoryScanResult;
  }> {
    const [valuesIndex, readingLogIndex, focusFallbackIndex, workoutScan] =
      await Promise.all([
        readValuesCompassIndex(this.app, this.settings.valuesCompassPath),
        readReadingLogIndex(this.app, this.settings.readingLogPath),
        readFocusSectionFallbackIndex(this.app, this.settings.diaryFolder),
        detectWorkoutRecordDays(this.app, this.settings.workoutsFolder),
      ]);
    this.externalCache = {
      valuesIndex,
      readingLogIndex,
      focusFallbackIndex,
      workoutScan,
    };
    return this.externalCache;
  }

  public getRawRecords(): DailyRecord[] {
    const cache = this.externalCache;
    return collectDailyRecords(this.app, this.settings.diaryFolder, {
      socialLimitMin: this.settings.socialLimitMin,
      valuesIndex: cache?.valuesIndex ?? null,
      readingLogIndex: cache?.readingLogIndex ?? null,
      focusFallbackIndex: cache?.focusFallbackIndex ?? null,
      workoutDatesSet: cache?.workoutScan.workoutDatesSet ?? null,
      workoutMetricsByDate: cache?.workoutScan.workoutMetricsByDate ?? null,
    });
  }

  public async loadExternalAnalyticsBundle(): Promise<ExternalAnalyticsBundle> {
    const cache = await this.refreshExternalCache();
    const records = collectDailyRecords(this.app, this.settings.diaryFolder, {
      socialLimitMin: this.settings.socialLimitMin,
      valuesIndex: cache.valuesIndex,
      readingLogIndex: cache.readingLogIndex,
      focusFallbackIndex: cache.focusFallbackIndex,
      workoutDatesSet: cache.workoutScan.workoutDatesSet,
      workoutMetricsByDate: cache.workoutScan.workoutMetricsByDate,
    });
    return {
      records,
      recordDatesSet: new Set(cache.workoutScan.recordDaySummariesByDate.keys()),
      workoutDatesSet: cache.workoutScan.workoutDatesSet,
    };
  }

  public async getRawRecordsAsync(): Promise<DailyRecord[]> {
    const bundle = await this.loadExternalAnalyticsBundle();
    return bundle.records;
  }

  public async getReportAsync(days: number = 30): Promise<AnalyticsReport> {
    const bundle = await this.loadExternalAnalyticsBundle();
    return analyzeRecords(bundle.records, days, {
      recordDatesSet: bundle.recordDatesSet,
      workoutDatesSet: bundle.workoutDatesSet,
      socialLimitMin: this.settings.socialLimitMin,
    });
  }

  public getReport(days: number = 30): AnalyticsReport {
    const records = this.getRawRecords();
    const scan = this.externalCache?.workoutScan;
    return analyzeRecords(records, days, {
      recordDatesSet: scan
        ? new Set(scan.recordDaySummariesByDate.keys())
        : undefined,
      workoutDatesSet: scan?.workoutDatesSet,
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
