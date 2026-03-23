'use client';

import { useMemo, useState } from 'react';

const KG_TO_LB = 2.2046226218;
const CHART_WIDTH = 1100;
const CHART_HEIGHT = 320;
const PLOT_PADDING = { top: 20, right: 20, bottom: 34, left: 50 };

type TrendRow = {
  day: string;
  weight_kg: number | null;
  weight_7d_avg_kg: number | null;
  calories: number | null;
  calories_7d_avg: number | null;
  steps: number | null;
  steps_7d_avg: number | null;
  protein_g: number | null;
  protein_7d_avg_g: number | null;
  fat_g: number | null;
  fat_7d_avg_g: number | null;
  carbs_g: number | null;
  carbs_7d_avg_g: number | null;
};

type Mode = 'weight' | 'calories' | 'steps' | 'macros';

type Series = {
  label: string;
  colorClass: string;
  values: Array<number | null>;
  dashed?: boolean;
};

type SummaryRow = {
  label: string;
  daily: number | null;
  average: number | null;
  formatter: (value: number | null) => string;
};

type ModeConfig = {
  title: string;
  subtitle: string;
  series: Series[];
  summaryRows: SummaryRow[];
};

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'weight', label: 'Weight' },
  { id: 'calories', label: 'Calories' },
  { id: 'steps', label: 'Steps' },
  { id: 'macros', label: 'Macros' },
];

function toLb(valueKg: number | null) {
  if (valueKg == null) return null;
  return valueKg * KG_TO_LB;
}

function formatWeight(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)} lb`;
}

function formatCalories(value: number | null) {
  return value == null ? '—' : `${Math.round(value).toLocaleString()} kcal`;
}

function formatSteps(value: number | null) {
  return value == null ? '—' : Math.round(value).toLocaleString();
}

function formatGrams(value: number | null) {
  return value == null ? '—' : `${Math.round(value)} g`;
}

function formatAxisValue(value: number) {
  if (Number.isInteger(value)) return Math.round(value).toLocaleString();
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatMonthLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(parsed).replace(' ', " '");
}

function getMonthTicks(rows: TrendRow[]) {
  const ticks: Array<{ x: number; label: string; anchor: 'start' | 'middle' | 'end'; tickX: number }> = [];
  if (!rows.length) return ticks;

  const firstParsed = parseDay(rows[0].day);
  const lastParsed = parseDay(rows[rows.length - 1].day);
  if (!firstParsed || !lastParsed) return ticks;

  const startMonth = new Date(Date.UTC(firstParsed.getUTCFullYear(), firstParsed.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(lastParsed.getUTCFullYear(), lastParsed.getUTCMonth(), 1));

  for (
    let cursor = new Date(startMonth.getTime());
    cursor <= endMonth;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const tickDay = formatDayIso(cursor);
    const x = xPositionForDay(tickDay, rows);
    if (x == null) continue;

    const isFirst = cursor.getTime() === startMonth.getTime();
    const isLast = cursor.getTime() === endMonth.getTime();
    const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
    const labelOffset = isFirst ? 14 : isLast ? -14 : 0;
    ticks.push({
      x: x + labelOffset,
      tickX: x,
      label: formatMonthLabel(tickDay),
      anchor,
    });
  }

  return ticks;
}

function parseDay(day: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function xPositionForDay(day: string, rows: TrendRow[]) {
  if (!rows.length) return null;

  const start = parseDay(rows[0].day);
  const end = parseDay(rows[rows.length - 1].day);
  const target = parseDay(day);
  if (!start || !end || !target) return null;

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const offsetDays = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const width = CHART_WIDTH - PLOT_PADDING.left - PLOT_PADDING.right;
  const ratio = Math.min(1, Math.max(0, offsetDays / totalDays));
  return PLOT_PADDING.left + ratio * width;
}

function modeConfig(mode: Mode, rows: TrendRow[]): ModeConfig {
  if (mode === 'weight') {
    return {
      title: 'Weight Trend',
      subtitle: 'Daily weight and rolling 7-day average.',
      series: [
        {
          label: 'Daily weight',
          colorClass: 'seriesWeightDaily',
          values: rows.map((row) => toLb(row.weight_kg)),
        },
        {
          label: '7-day avg',
          colorClass: 'seriesWeightAvg',
          values: rows.map((row) => toLb(row.weight_7d_avg_kg)),
          dashed: true,
        },
      ],
      summaryRows: [
        {
          label: 'Weight',
          daily: toLb(rows.at(-1)?.weight_kg ?? null),
          average: toLb(rows.at(-1)?.weight_7d_avg_kg ?? null),
          formatter: formatWeight,
        },
      ],
    };
  }

  if (mode === 'calories') {
    return {
      title: 'Calories Trend',
      subtitle: 'Daily calories and rolling 7-day average.',
      series: [
        {
          label: 'Daily calories',
          colorClass: 'seriesCaloriesDaily',
          values: rows.map((row) => row.calories),
        },
        {
          label: '7-day avg',
          colorClass: 'seriesCaloriesAvg',
          values: rows.map((row) => row.calories_7d_avg),
          dashed: true,
        },
      ],
      summaryRows: [
        {
          label: 'Calories',
          daily: rows.at(-1)?.calories ?? null,
          average: rows.at(-1)?.calories_7d_avg ?? null,
          formatter: formatCalories,
        },
      ],
    };
  }

  if (mode === 'steps') {
    return {
      title: 'Steps Trend',
      subtitle: 'Daily steps and rolling 7-day average.',
      series: [
        {
          label: 'Daily steps',
          colorClass: 'seriesStepsDaily',
          values: rows.map((row) => row.steps),
        },
        {
          label: '7-day avg',
          colorClass: 'seriesStepsAvg',
          values: rows.map((row) => row.steps_7d_avg),
          dashed: true,
        },
      ],
      summaryRows: [
        {
          label: 'Steps',
          daily: rows.at(-1)?.steps ?? null,
          average: rows.at(-1)?.steps_7d_avg ?? null,
          formatter: formatSteps,
        },
      ],
    };
  }

  return {
    title: 'Macros Trend',
    subtitle: 'Daily and 7-day averages for protein, fat, and carbs.',
    series: [
      {
        label: 'Protein daily',
        colorClass: 'seriesProteinDaily',
        values: rows.map((row) => row.protein_g),
      },
      {
        label: 'Protein 7-day avg',
        colorClass: 'seriesProteinAvg',
        values: rows.map((row) => row.protein_7d_avg_g),
        dashed: true,
      },
      {
        label: 'Fat daily',
        colorClass: 'seriesFatDaily',
        values: rows.map((row) => row.fat_g),
      },
      {
        label: 'Fat 7-day avg',
        colorClass: 'seriesFatAvg',
        values: rows.map((row) => row.fat_7d_avg_g),
        dashed: true,
      },
      {
        label: 'Carbs daily',
        colorClass: 'seriesCarbsDaily',
        values: rows.map((row) => row.carbs_g),
      },
      {
        label: 'Carbs 7-day avg',
        colorClass: 'seriesCarbsAvg',
        values: rows.map((row) => row.carbs_7d_avg_g),
        dashed: true,
      },
    ],
    summaryRows: [
      {
        label: 'Protein',
        daily: rows.at(-1)?.protein_g ?? null,
        average: rows.at(-1)?.protein_7d_avg_g ?? null,
        formatter: formatGrams,
      },
      {
        label: 'Fat',
        daily: rows.at(-1)?.fat_g ?? null,
        average: rows.at(-1)?.fat_7d_avg_g ?? null,
        formatter: formatGrams,
      },
      {
        label: 'Carbs',
        daily: rows.at(-1)?.carbs_g ?? null,
        average: rows.at(-1)?.carbs_7d_avg_g ?? null,
        formatter: formatGrams,
      },
    ],
  };
}

function getExtent(series: Series[]) {
  const values = series
    .flatMap((line) => line.values)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!values.length) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const tickStep = chooseTickStep(rawMin, rawMax);
  const min = Math.floor(rawMin / tickStep) * tickStep;
  const max = Math.ceil(rawMax / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let value = min; value <= max + tickStep * 0.5; value += tickStep) {
    ticks.push(Number(value.toFixed(6)));
  }

  if (ticks.length < 2) {
    ticks.push(min + tickStep);
  }

  return { min, max, ticks };
}

function chooseTickStep(rawMin: number, rawMax: number) {
  const span = Math.max(rawMax - rawMin, 1);
  const roughStep = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  let stepMultiplier = 1;
  if (normalized <= 1) stepMultiplier = 1;
  else if (normalized <= 2) stepMultiplier = 2;
  else if (normalized <= 2.5) stepMultiplier = 2.5;
  else if (normalized <= 5) stepMultiplier = 5;
  else stepMultiplier = 10;

  return stepMultiplier * magnitude;
}

function xPosition(index: number, count: number) {
  const width = CHART_WIDTH - PLOT_PADDING.left - PLOT_PADDING.right;
  if (count <= 1) return PLOT_PADDING.left;
  return PLOT_PADDING.left + (index / (count - 1)) * width;
}

function yPosition(value: number, min: number, max: number) {
  const height = CHART_HEIGHT - PLOT_PADDING.top - PLOT_PADDING.bottom;
  return PLOT_PADDING.top + ((max - value) / (max - min)) * height;
}

function toPath(values: Array<number | null>, min: number, max: number) {
  let path = '';
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) continue;

    const command = index > 0 && values[index - 1] != null ? 'L' : 'M';
    const x = xPosition(index, values.length);
    const y = yPosition(value, min, max);
    path += `${command}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return path.trim();
}

export function TrendChart({ rows }: { rows: TrendRow[] }) {
  const [mode, setMode] = useState<Mode>('weight');

  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => left.day.localeCompare(right.day)),
    [rows],
  );
  const config = useMemo(() => modeConfig(mode, sortedRows), [mode, sortedRows]);
  const extent = useMemo(() => getExtent(config.series), [config.series]);

  if (!rows.length) {
    return <div className="small">No imported data yet. Run a sync to populate trends.</div>;
  }

  const min = extent.min;
  const max = extent.max;
  const ticks = extent.ticks;
  const firstDay = sortedRows[0]?.day;
  const lastDay = sortedRows.at(-1)?.day;
  const monthTicks = getMonthTicks(sortedRows);

  return (
    <div>
      <div className="panelHeader trendHeader">
        <div>
          <h2 style={{ margin: 0 }}>Trends</h2>
          <div className="small">Daily lines + 7-day smoothing for fast signal checks.</div>
        </div>
      </div>

      <div className="modeButtons" role="tablist" aria-label="Trend mode">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`modeButton${mode === option.id ? ' active' : ''}`}
            onClick={() => setMode(option.id)}
            aria-pressed={mode === option.id}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="chartTitleRow">
        <div>
          <div className="chartModeTitle">{config.title}</div>
          <div className="small">{config.subtitle}</div>
        </div>
        <div className="small chartRangeLabel">
          {firstDay && lastDay ? `${formatMonthLabel(firstDay)} - ${formatMonthLabel(lastDay)}` : '—'}
        </div>
      </div>

      <div className="chartWrap">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="chartSvg" role="img" aria-label={`${config.title} chart`}>
          <line
            x1={PLOT_PADDING.left}
            y1={CHART_HEIGHT - PLOT_PADDING.bottom}
            x2={CHART_WIDTH - PLOT_PADDING.right}
            y2={CHART_HEIGHT - PLOT_PADDING.bottom}
            className="chartAxis"
          />
          <line
            x1={PLOT_PADDING.left}
            y1={PLOT_PADDING.top}
            x2={PLOT_PADDING.left}
            y2={CHART_HEIGHT - PLOT_PADDING.bottom}
            className="chartAxis"
          />

          {ticks.map((tick) => {
            const y = yPosition(tick, min, max);
            return (
              <g key={tick}>
                <line
                  x1={PLOT_PADDING.left}
                  y1={y}
                  x2={CHART_WIDTH - PLOT_PADDING.right}
                  y2={y}
                  className="chartGridLine"
                />
                <text x={PLOT_PADDING.left - 8} y={y + 4} textAnchor="end" className="chartLabel">
                  {formatAxisValue(tick)}
                </text>
              </g>
            );
          })}

          {config.series.map((line) => {
            const path = toPath(line.values, min, max);
            if (!path) return null;

            return (
              <path
                key={line.label}
                d={path}
                fill="none"
                className={line.colorClass}
                strokeWidth={line.dashed ? 3.5 : 2}
                strokeOpacity={line.dashed ? 0.95 : 0.55}
                strokeDasharray={line.dashed ? '6 5' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {monthTicks.map((tick) => (
            <g key={`${tick.label}-${tick.tickX}`}>
              <line
                x1={tick.tickX}
                y1={CHART_HEIGHT - PLOT_PADDING.bottom}
                x2={tick.tickX}
                y2={CHART_HEIGHT - PLOT_PADDING.bottom + 8}
                className="chartTickMark"
              />
              <text x={tick.x} y={CHART_HEIGHT - 4} textAnchor={tick.anchor} className="chartLabel">
                {tick.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="chartLegend">
        {config.series.map((line) => (
          <div className="legendItem" key={line.label}>
            <span className={`legendSwatch ${line.colorClass}`}></span>
            <span className="small">{line.label}</span>
          </div>
        ))}
      </div>

      <div className="summaryWrap">
        <table className="summaryTable">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Daily</th>
              <th>7-day avg</th>
            </tr>
          </thead>
          <tbody>
            {config.summaryRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.formatter(row.daily)}</td>
                <td>{row.formatter(row.average)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
