// src/report-modal.ts
import { App, Modal, setIcon } from "obsidian";
import { AnalyticsReport, DailyRecord } from "./types";
import {
  analyzeRecords,
  DEFAULT_VISIBLE_CORRELATIONS,
  MIN_PAIR_SAMPLE,
  MIN_SIGNIFICANT_R,
} from "./engine";
import { renderScatterPlotSvg } from "./scatter-plot";
import { r2 } from "./workout-pr";
import type MyCorrelationAnalyticsPlugin from "./main";

const DEFAULT_VISIBLE_HABITS = 6;

function cleanLagPart(label: string): string {
  return label
    .replace(/\s*\((сегодня|завтра)\)/gi, "")
    .replace(/^Оценку дня$/i, "Оценка")
    .replace(/^Энергию$/i, "Энергия")
    .trim();
}

function extractPairMeans(description: string): string {
  const m = description.match(/(\d+(?:[.,]\d+)?)\s+против\s+(\d+(?:[.,]\d+)?)/);
  return m ? `${m[1]} / ${m[2]}` : "";
}

function formatHourOfDay(hourVal: number): string {
  const totalMin = ((Math.round(hourVal * 60) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
  const mm = String(totalMin % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatHourDeltaHuman(deltaHours: number): string {
  const totalMin = Math.round(Math.abs(deltaHours) * 60);
  if (totalMin === 0) return "0 мин";
  const sign = deltaHours > 0 ? "+" : "-";
  if (totalMin < 60) return `${sign}${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${sign}${h} ч ${m} мин` : `${sign}${h} ч`;
}

export class CorrelationReportModal extends Modal {
  private plugin: MyCorrelationAnalyticsPlugin;
  private allRecords: DailyRecord[];
  private currentDays: number = 30;
  private expandedCorrelationId: string | null = null;
  private recordDetailsOpen: boolean = false;
  private showAllCorrelations: boolean = false;
  private showAllHabits: boolean = false;

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
    await this.reloadExternalData();
    this.renderModal();
  }

  private async reloadExternalData(): Promise<void> {
    const bundle = await this.plugin.loadExternalAnalyticsBundle();
    this.recordDatesSet = bundle.recordDatesSet;
    this.workoutDatesSet = bundle.workoutDatesSet;
    this.allRecords = bundle.records;
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
        socialLimitMin: this.plugin.settings.socialLimitMin,
      }
    );

    const root = contentEl.createDiv({ cls: "mca-root" });

    // ── Шапка + сегментный переключатель периодов ──────────────────────────
    const head = root.createDiv({ cls: "mca-head" });
    const headTop = head.createDiv({ cls: "mca-head-top" });

    const titleWrap = headTop.createDiv({ cls: "mca-title-wrap" });
    titleWrap.createEl("h2", { cls: "mca-title", text: "Аналитика связей" });
    titleWrap.createDiv({
      cls: "mca-meta-line",
      text: `${report.totalRecords} дн. · ${report.recordDaysReport.totalWorkoutDaysInPeriod} трен. · ${report.recordDaysReport.totalRecordDaysInPeriod} рек.`,
    });

    const segTrack = headTop.createDiv({
      cls: "mca-seg-track",
      attr: { role: "tablist" },
    });
    const periods: Array<{ days: number; label: string }> = [
      { days: 30, label: "30 дн." },
      { days: 90, label: "90 дн." },
      { days: 0, label: "Всё" },
    ];

    periods.forEach((p) => {
      const isAct = this.currentDays === p.days;
      const btn = segTrack.createEl("button", {
        cls: `mca-seg-btn ${isAct ? "is-active" : ""}`,
        text: p.label,
        attr: { type: "button", role: "tab", "aria-selected": String(isAct) },
      });
      btn.onclick = () => {
        if (this.currentDays !== p.days) {
          this.currentDays = p.days;
          this.expandedCorrelationId = null;
          this.showAllCorrelations = false;
          this.showAllHabits = false;
          this.renderModal();
        }
      };
    });

    // ── 1. Ключевые связи (с раскрываемым графиком) ────────────────────────
    this.renderCorrelationsSection(root, report);

    // ── 2. Привычки внутри дня ─────────────────────────────────────────────
    this.renderHabitsSection(root, report);

    // ── 3. Эффект на следующий день ────────────────────────────────────────
    if (report.lagImpacts.length > 0) {
      this.renderLagSection(root, report);
    }

    // ── 4. Лимит соцсетей ──────────────────────────────────────────────────
    if (report.socialLimitInsights.length > 0) {
      this.renderSocialLimitSection(root, report);
    }

    // ── 5. Дни рекордов (сворачиваемый блок) ───────────────────────────────
    this.renderRecordDaysSection(root, report);
  }

  private renderCorrelationsSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const island = container.createDiv({ cls: "mca-island" });
    const secHead = island.createDiv({ cls: "mca-sec-head" });
    secHead.createSpan({ cls: "mca-sec-title", text: "Ключевые связи" });
    if (report.topCorrelations.length > 0) {
      secHead.createSpan({ cls: "mca-sec-hint", text: "нажмите для графика" });
    }

    if (report.topCorrelations.length === 0) {
      island.createDiv({
        cls: "mca-empty",
        text: `Нет значимых связей (нужно n ≥ ${MIN_PAIR_SAMPLE}, |r| ≥ ${MIN_SIGNIFICANT_R}). Выберите «90 дн.» или «Всё».`,
      });
      return;
    }

    const list = island.createDiv({ cls: "mca-corr-list" });
    const visible = this.showAllCorrelations
      ? report.topCorrelations
      : report.topCorrelations.slice(0, DEFAULT_VISIBLE_CORRELATIONS);

    visible.forEach((item) => {
      const isExpanded = this.expandedCorrelationId === item.id;
      const isLag = (item.lagDays ?? 0) > 0;
      const card = list.createDiv({
        cls: `mca-corr-card ${isLag ? "is-lag" : ""} ${
          isExpanded ? "is-expanded" : ""
        }`,
      });

      const row = card.createDiv({ cls: "mca-corr-row" });
      row.createSpan({ cls: "mca-row-label", text: item.label });

      const right = row.createDiv({ cls: "mca-row-right" });
      const metaParts: string[] = [];
      if (item.strengthLabel) metaParts.push(item.strengthLabel);
      metaParts.push(`n=${item.sampleCount}`);
      right.createSpan({
        cls: "mca-row-meta",
        text: metaParts.join(" · "),
      });

      const badgeText =
        item.valueBadge ?? `${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`;
      const isPositive = item.isPositive ?? item.r > 0;
      right.createSpan({
        cls: `mca-badge ${isPositive ? "is-up" : "is-down"}`,
        text: badgeText,
      });

      const chevronEl = right.createSpan({
        cls: "mca-chevron",
        attr: { "aria-hidden": "true" },
      });
      setIcon(chevronEl, "chevron-right");

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
          item.r,
          {
            xIsTimeHour: item.id.startsWith("bedtime_"),
            xIsBinary: item.kind === "mean_diff",
          }
        );
        plotHost.appendChild(svg);
      }
    });

    if (report.topCorrelations.length > DEFAULT_VISIBLE_CORRELATIONS) {
      const hidden =
        report.topCorrelations.length - DEFAULT_VISIBLE_CORRELATIONS;
      const moreBtn = island.createEl("button", {
        cls: "mca-ghost-btn",
        text: this.showAllCorrelations ? "Свернуть" : `Показать ещё ${hidden}`,
        attr: { type: "button" },
      });
      moreBtn.onclick = () => {
        this.showAllCorrelations = !this.showAllCorrelations;
        this.renderModal();
      };
    }
  }

  private renderHabitsSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const island = container.createDiv({ cls: "mca-island" });
    const secHead = island.createDiv({ cls: "mca-sec-head" });
    secHead.createSpan({ cls: "mca-sec-title", text: "Привычки → День" });
    if (report.topHabitImpacts.length > 0) {
      secHead.createSpan({ cls: "mca-sec-hint", text: "с / без" });
    }

    if (report.topHabitImpacts.length === 0) {
      island.createDiv({
        cls: "mca-empty",
        text: "Недостаточно данных по привычкам за период.",
      });
      return;
    }

    const list = island.createDiv({ cls: "mca-rows-list" });
    const visible = this.showAllHabits
      ? report.topHabitImpacts
      : report.topHabitImpacts.slice(0, DEFAULT_VISIBLE_HABITS);

    visible.forEach((item) => {
      const row = list.createDiv({
        cls: "mca-list-row",
        attr: {
          title: `С привычкой: ${item.avgWhenTrue.toFixed(1)} (${item.countTrue} дн.) · Без: ${item.avgWhenFalse.toFixed(1)} (${item.countFalse} дн.)`,
        },
      });

      const targetTitle =
        item.targetMetric === "score"
          ? "Оценка"
          : item.targetMetric === "energy"
            ? "Энергия"
            : "Фокус";
      const unitSuffix = item.targetMetric === "focusHours" ? " ч" : "";

      row.createSpan({
        cls: "mca-row-label",
        text: `${item.habitName} → ${targetTitle}`,
      });

      const right = row.createDiv({ cls: "mca-row-right" });
      right.createSpan({
        cls: "mca-row-meta",
        text: `${item.avgWhenTrue.toFixed(1)} / ${item.avgWhenFalse.toFixed(1)}${unitSuffix}`,
      });

      const isUp = item.delta > 0;
      right.createSpan({
        cls: `mca-badge ${isUp ? "is-up" : "is-down"}`,
        text: `${isUp ? "+" : ""}${item.delta.toFixed(1)}${unitSuffix}`,
      });
    });

    if (report.topHabitImpacts.length > DEFAULT_VISIBLE_HABITS) {
      const hidden = report.topHabitImpacts.length - DEFAULT_VISIBLE_HABITS;
      const moreBtn = island.createEl("button", {
        cls: "mca-ghost-btn",
        text: this.showAllHabits ? "Свернуть" : `Показать ещё ${hidden}`,
        attr: { type: "button" },
      });
      moreBtn.onclick = () => {
        this.showAllHabits = !this.showAllHabits;
        this.renderModal();
      };
    }
  }

  private renderLagSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const island = container.createDiv({ cls: "mca-island is-lag-island" });
    const secHead = island.createDiv({ cls: "mca-sec-head" });
    secHead.createSpan({ cls: "mca-sec-title", text: "Эффект на завтра" });
    secHead.createSpan({ cls: "mca-sec-hint", text: "с / без" });

    const list = island.createDiv({ cls: "mca-rows-list" });
    report.lagImpacts.forEach((lag) => {
      const means = extractPairMeans(lag.description);
      const row = list.createDiv({
        cls: "mca-list-row",
        attr: { title: `n = ${lag.sampleCount} парных дней` },
      });

      row.createSpan({
        cls: "mca-row-label",
        text: `${cleanLagPart(lag.factorLabel)} → ${cleanLagPart(lag.targetLabel)}`,
      });

      const right = row.createDiv({ cls: "mca-row-right" });
      right.createSpan({
        cls: "mca-row-meta",
        text: means || `n=${lag.sampleCount}`,
      });
      right.createSpan({
        cls: `mca-badge ${lag.isPositive ? "is-up" : "is-down"}`,
        text: lag.deltaOrR,
      });
    });
  }

  private renderSocialLimitSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const limitMin = this.plugin.settings.socialLimitMin;
    const stats = report.socialStats;

    const island = container.createDiv({ cls: "mca-island" });
    const secHead = island.createDiv({ cls: "mca-sec-head" });
    secHead.createSpan({
      cls: "mca-sec-title",
      text: `Лимит соцсетей ≤ ${limitMin} мин`,
    });

    const hintParts: string[] = [];
    if (stats.avgSocialMinutes !== null) {
      hintParts.push(`ср. ${Math.round(stats.avgSocialMinutes)} мин`);
    }
    if (stats.daysTracked > 0) {
      hintParts.push(`${stats.percentWithinLimit}% в норме`);
    }
    if (hintParts.length > 0) {
      secHead.createSpan({
        cls: "mca-sec-hint",
        text: hintParts.join(" · "),
      });
    }

    const list = island.createDiv({ cls: "mca-rows-list" });
    report.socialLimitInsights.forEach((item) => {
      const row = list.createDiv({
        cls: "mca-list-row",
        attr: {
          title: `В лимите: ${item.avgUnderLimit.toFixed(1)} (${item.daysUnder} дн.) · Сверх: ${item.avgOverLimit.toFixed(1)} (${item.daysOver} дн.)`,
        },
      });

      const socialTargetLabel =
        item.metric === "score"
          ? "Оценка дня"
          : item.metric === "energy"
            ? "Энергия"
            : "Глубокая работа";
      const unitSuffix = item.metric === "focusHours" ? " ч" : "";

      row.createSpan({
        cls: "mca-row-label",
        text: socialTargetLabel,
      });

      const right = row.createDiv({ cls: "mca-row-right" });
      right.createSpan({
        cls: "mca-row-meta",
        text: `${item.avgUnderLimit.toFixed(1)} / ${item.avgOverLimit.toFixed(1)}${unitSuffix}`,
      });

      const isUp = item.delta > 0;
      right.createSpan({
        cls: `mca-badge ${isUp ? "is-up" : "is-down"}`,
        text: `${isUp ? "+" : ""}${item.delta.toFixed(1)}${unitSuffix}`,
      });
    });
  }

  private renderRecordDaysSection(
    container: HTMLElement,
    report: AnalyticsReport
  ): void {
    const rec = report.recordDaysReport;
    const isOpen = this.recordDetailsOpen;

    const section = container.createDiv({
      cls: `mca-island mca-pr-details ${isOpen ? "is-open" : ""}`,
    });

    const headerBtn = section.createEl("button", {
      cls: "mca-pr-summary",
      attr: {
        type: "button",
        "aria-expanded": String(isOpen),
      },
    });

    const left = headerBtn.createDiv({ cls: "mca-pr-summary-left" });
    const chevronEl = left.createSpan({
      cls: "mca-chevron",
      attr: { "aria-hidden": "true" },
    });
    setIcon(chevronEl, "chevron-right");
    left.createSpan({
      cls: "mca-sec-title",
      text: "Дни рекордов",
    });

    const prHintText =
      rec.comparisonBaseline === "workout_days"
        ? `${rec.totalRecordDaysInPeriod} из ${rec.totalWorkoutDaysInPeriod} трен.`
        : `${rec.totalRecordDaysInPeriod} из ${report.totalRecords} дн.`;
    headerBtn.createSpan({
      cls: "mca-sec-hint",
      text: prHintText,
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
        text: "Рекордов за период нет. Выберите «90 дн.» или «Всё».",
      });
      return;
    }

    if (rec.lowSampleOverall) {
      body.createDiv({
        cls: "mca-pr-warning",
        text: `Мало рекордов (${rec.totalRecordDaysInPeriod} дн.) — средние ориентировочные.`,
      });
    }

    const tableWrap = body.createDiv({ cls: "mca-pr-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "mca-pr-table" });
    const thead = table.createEl("thead");
    const trH = thead.createEl("tr");
    trH.createEl("th", { text: "Показатель" });
    trH.createEl("th", { text: "Рекорд" });
    trH.createEl("th", {
      text: rec.comparisonBaseline === "workout_days" ? "Обычн. трен." : "Обычный",
    });
    trH.createEl("th", { text: "Δ" });

    const tbody = table.createEl("tbody");
    for (const row of rec.rows) {
      const tr = tbody.createEl("tr", {
        cls: row.lowSample ? "is-low-sample" : "",
        attr: {
          title: `Дней: ${row.countRecordDays} рек. / ${row.countOtherDays} об.`,
        },
      });

      const cleanName = row.label.replace(/^Привычка:\s*/i, "");
      const tdName = tr.createEl("td", { cls: "mca-pr-td-name" });
      tdName.createSpan({ text: cleanName });
      if (row.lowSample) {
        tdName.createSpan({ cls: "mca-low-tag", text: "мало" });
      }

      const fmtVal = (val: number | null) => {
        if (val === null) return "—";
        if (row.kind === "habit_pct") return `${Math.round(val)}%`;
        if (row.key === "bedtimeHour") return formatHourOfDay(val);
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
        const deltaText =
          row.key === "bedtimeHour"
            ? formatHourDeltaHuman(row.delta)
            : `${sign}${r2(row.delta).toLocaleString("ru-RU")}${unitSuffix}`;
        const isGood =
          row.delta === 0
            ? null
            : row.higherIsBetter
              ? row.delta > 0
              : row.delta < 0;
        tdDelta.createSpan({
          cls:
            "mca-badge" +
            (isGood === true ? " is-up" : isGood === false ? " is-down" : ""),
          text: deltaText,
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}