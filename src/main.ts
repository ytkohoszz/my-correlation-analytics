import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { collectDailyRecords } from "./data-collector";
import { analyzeRecords } from "./engine";
import { CorrelationReportModal } from "./report-modal";
import {
  AnalyticsReport,
  CorrelationAnalyticsSettings,
  DailyRecord,
  DEFAULT_SETTINGS,
  PRComparisonScope,
  PRLagMode,
  PRMetricCriterion,
} from "./types";
import {
  detectWorkoutPRDays,
  syncPRFlagsToDiaryFrontmatter,
} from "./workout-pr";

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
      .setName("Критерий рекорда по умолчанию")
      .setDesc(
        "Первый подход каждого варианта («название | тип нагрузки | доп. вес») всегда считается стартовой точкой, а не рекордом"
      )
      .addDropdown((d) =>
        d
          .addOption("max_reps", "Максимум повторений / секунд на данном весе")
          .addOption("total_volume", "Максимальный объём за тренировку на данном весе")
          .addOption("max_weight", "Максимальный дополнительный вес в упражнении")
          .addOption("any", "Любой из трёх критериев")
          .setValue(this.plugin.settings.prCriterion)
          .onChange(async (val) => {
            this.plugin.settings.prCriterion = val as PRMetricCriterion;
            await this.plugin.saveSettingsData();
          })
      );

    new Setting(containerEl)
      .setName("Режим лага для дней рекордов")
      .setDesc("Сравнивать метрики в сам день рекорда (t) или накануне (t−1)")
      .addDropdown((d) =>
        d
          .addOption("same_day", "В день рекорда (t)")
          .addOption("prev_day", "Накануне рекорда (t−1)")
          .setValue(this.plugin.settings.prLagMode)
          .onChange(async (val) => {
            this.plugin.settings.prLagMode = val as PRLagMode;
            await this.plugin.saveSettingsData();
          })
      );

    new Setting(containerEl)
      .setName("Группа сравнения для дней рекордов")
      .setDesc("С какими днями сравнивать дни рекордов")
      .addDropdown((d) =>
        d
          .addOption("all_days", "Все дни без рекорда")
          .addOption("workout_days", "Только тренировочные дни без рекорда")
          .setValue(this.plugin.settings.prComparisonScope)
          .onChange(async (val) => {
            this.plugin.settings.prComparisonScope = val as PRComparisonScope;
            await this.plugin.saveSettingsData();
          })
      );

    new Setting(containerEl)
      .setName("Записать метки рекордов в YAML ежедневника (опционально)")
      .setDesc(
        "Аналитика считает рекорды на лету без изменения файлов. Эта кнопка при желании пропишет «рекорд_тренировки: true» и «рекорды_упражнений» в заметки ежедневника через processFrontMatter"
      )
      .addButton((btn) =>
        btn.setButtonText("Синхронизировать YAML").onClick(async () => {
          btn.setDisabled(true);
          try {
            const scan = await detectWorkoutPRDays(
              this.app,
              this.plugin.settings.workoutsFolder,
              this.plugin.settings.prCriterion
            );
            const count = await syncPRFlagsToDiaryFrontmatter(
              this.app,
              this.plugin.settings.diaryFolder,
              scan.prDaysByDate
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
    const raw = (await this.loadData()) as Partial<CorrelationAnalyticsSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
  }

  async saveSettingsData(): Promise<void> {
    await this.saveData(this.settings);
  }

  public getRawRecords(): DailyRecord[] {
    return collectDailyRecords(this.app, this.settings.diaryFolder);
  }

  public async getReportAsync(days: number = 30): Promise<AnalyticsReport> {
    const records = this.getRawRecords();
    const scan = await detectWorkoutPRDays(
      this.app,
      this.settings.workoutsFolder,
      this.settings.prCriterion
    );
    return analyzeRecords(records, days, {
      prDaysByDate: scan.prDaysByDate,
      workoutDatesSet: scan.workoutDatesSet,
      prCriterion: this.settings.prCriterion,
      prLagMode: this.settings.prLagMode,
      prComparisonScope: this.settings.prComparisonScope,
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
