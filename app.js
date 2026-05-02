const DATA_URL = 'data/dashboard-health.csv';
const STATUS_URL = 'data/sync-status.json';
const TDEE_WINDOW_DAYS = 35;
const TDEE_MIN_DAYS = 28;
let dashboardRows = [];
let activeMetric = 'weight';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmt(value, formatter = number, suffix = '') {
  return Number.isFinite(value) ? `${formatter.format(value)}${suffix}` : '—';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char]));
}

function parseCsv(csv) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(',').map((h) => h.trim());

  return lines.map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
    return {
      date: row.date,
      weight_lbs: parseFloat(row.weight_lbs),
      bodyfat_percent: parseFloat(row.bodyfat_percent),
      dexa_fat_free_mass_lbs: parseFloat(row.dexa_fat_free_mass_lbs),
      scale_bodyfat_percent: parseFloat(row.scale_bodyfat_percent),
      calories: parseInt(row.calories, 10),
      steps: parseInt(row.steps, 10),
      protein_g: parseInt(row.protein_g, 10),
      carbs_g: parseInt(row.carbs_g, 10),
      fat_g: parseInt(row.fat_g, 10),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function averageMetric(rows, index, key, days = 7) {
  const slice = rows.slice(Math.max(0, index - days + 1), index + 1).filter((r) => Number.isFinite(r[key]));
  if (slice.length < days) return null;
  return slice.reduce((sum, row) => sum + row[key], 0) / slice.length;
}

function movingAverage(rows, index, days = 7) {
  return averageMetric(rows, index, 'weight_lbs', days);
}

function estimateTdee(rows, index, windowDays = TDEE_WINDOW_DAYS) {
  const end = index;
  const start = Math.max(0, end - windowDays + 1);
  const window = rows.slice(start, end + 1).filter((r) => Number.isFinite(r.weight_lbs) && Number.isFinite(r.calories));
  if (window.length < TDEE_MIN_DAYS) return null;

  const firstIndex = rows.indexOf(window[0]);
  const lastIndex = rows.indexOf(window[window.length - 1]);
  const firstAvgWeight = movingAverage(rows, firstIndex);
  const lastAvgWeight = movingAverage(rows, lastIndex);
  if (!Number.isFinite(firstAvgWeight) || !Number.isFinite(lastAvgWeight)) return null;

  const elapsedDays = Math.max(1, daysBetween(window[0].date, window[window.length - 1].date));
  if (elapsedDays < TDEE_MIN_DAYS - 1) return null;

  const avgCalories = window.reduce((sum, row) => sum + row.calories, 0) / window.length;
  const weightDeltaLbs = lastAvgWeight - firstAvgWeight;
  const dailyWeightEnergy = (weightDeltaLbs * 3500) / elapsedDays;

  // If average weight is falling, dailyWeightEnergy is negative, so subtracting it raises TDEE.
  return avgCalories - dailyWeightEnergy;
}

function daysBetween(a, b) {
  const ms = new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`);
  return Math.round(ms / 86400000);
}

function relativeTime(iso) {
  if (!iso) return 'never';
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!status) {
    el.innerHTML = '<span class="sync-state warn"><strong>Sync:</strong> no status yet</span>';
    return;
  }
  const sourceSummary = Object.values(status.sources || {}).map((source) => `
    <span class="sync-source ${source.status === 'ok' ? 'ok' : 'warn'}" title="${escapeHtml(source.message || '')}">
      ${escapeHtml(source.label)}: <strong>${source.status === 'ok' ? 'OK' : 'Needs attention'}</strong>
    </span>
  `).join('');
  el.innerHTML = `
    <span class="sync-state ${status.overall === 'ok' ? 'ok' : 'warn'}" title="${escapeHtml(status.finished_at || '—')}">
      <strong>Sync:</strong> ${relativeTime(status.finished_at)}
    </span>
    ${sourceSummary}
  `;
}

function drawMetricChart(rows) {
  const canvas = document.getElementById('weight-chart');
  const weeklyTable = document.getElementById('weekly-table-wrap');
  const showWeekly = activeMetric === 'weekly';
  canvas.classList.toggle('hidden', showWeekly);
  weeklyTable.classList.toggle('hidden', !showWeekly);
  canvas.hidden = showWeekly;
  weeklyTable.hidden = !showWeekly;

  if (showWeekly) {
    renderWeeklyAverages(rows);
    return;
  }

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 24, right: ['steps', 'tdee'].includes(activeMetric) ? 62 : 22, bottom: 44, left: 58 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (rows.length === 1 ? chartWidth / 2 : (i / (rows.length - 1)) * chartWidth);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.lineWidth = 1;

  if (activeMetric === 'steps') drawStepsChart(ctx, rows, { width, height, pad, chartWidth, chartHeight, x });
  else if (activeMetric === 'tdee') drawTdeeChart(ctx, rows, { width, height, pad, chartWidth, chartHeight, x });
  else drawWeightChart(ctx, rows, { width, height, pad, chartWidth, chartHeight, x });

  drawDateLabels(ctx, rows, { height, x });
}

function drawWeightChart(ctx, rows, layout) {
  const { width, pad, chartHeight, x } = layout;
  const min = 165;
  const max = 215;
  const y = (value) => pad.top + ((max - value) / (max - min)) * chartHeight;

  drawGrid(ctx, { width, pad, min, max, step: 5, y, formatter: (v) => `${oneDecimal.format(v)} lb` });
  drawLine(ctx, rows.map((row, i) => (Number.isFinite(row.weight_lbs) ? { x: x(i), y: y(row.weight_lbs) } : null)).filter(Boolean), '#72ddf7', 3);
  drawLine(ctx, rows.map((row, i) => {
    const avg = movingAverage(rows, i);
    return avg ? { x: x(i), y: y(avg) } : null;
  }).filter(Boolean), '#f7b267', 3);
}

function drawStepsChart(ctx, rows, layout) {
  const { width, pad, chartHeight, chartWidth, x } = layout;
  const dailyMax = niceMax(rows.map((row) => row.steps));
  const avgMax = niceMax(rows.map((_, i) => averageMetric(rows, i, 'steps')).filter(Number.isFinite));
  const leftY = (value) => pad.top + ((dailyMax - value) / dailyMax) * chartHeight;
  const rightY = (value) => pad.top + ((avgMax - value) / avgMax) * chartHeight;

  drawGrid(ctx, { width, pad, min: 0, max: dailyMax, step: dailyMax / 4, y: leftY, formatter: (v) => number.format(v) });
  drawRightAxis(ctx, { width, pad, min: 0, max: avgMax, step: avgMax / 4, y: rightY, formatter: (v) => number.format(v) });

  const barWidth = Math.max(2, Math.min(12, chartWidth / rows.length * 0.72));
  ctx.fillStyle = 'rgba(114, 221, 247, 0.55)';
  rows.forEach((row, i) => {
    if (!Number.isFinite(row.steps)) return;
    const barHeight = pad.top + chartHeight - leftY(row.steps);
    ctx.fillRect(x(i) - barWidth / 2, leftY(row.steps), barWidth, barHeight);
  });
  drawLine(ctx, rows.map((row, i) => {
    const avg = averageMetric(rows, i, 'steps');
    return avg ? { x: x(i), y: rightY(avg) } : null;
  }).filter(Boolean), '#f7b267', 3);
}

function weeklyStepAverages(rows) {
  const weeks = [];
  for (let start = 0; start < rows.length; start += 7) {
    const weekRows = rows.slice(start, start + 7);
    const stepAvg = avg(weekRows.map((row) => row.steps));
    if (Number.isFinite(stepAvg)) {
      weeks.push({ start, end: start + weekRows.length - 1, index: start + (weekRows.length - 1) / 2, steps: stepAvg });
    }
  }
  return weeks;
}

function drawTdeeChart(ctx, rows, layout) {
  const { width, pad, chartHeight, chartWidth, x } = layout;
  const points = rows.map((row, i) => ({ row, tdee: estimateTdee(rows, i) })).filter((p) => Number.isFinite(p.tdee));
  const stepWeeks = weeklyStepAverages(rows);
  if (!points.length) return;
  const values = points.map((p) => p.tdee);
  const min = Math.floor((Math.min(...values) - 100) / 100) * 100;
  const max = Math.ceil((Math.max(...values) + 100) / 100) * 100;
  const stepMax = niceMax(stepWeeks.map((week) => week.steps));
  const y = (value) => pad.top + ((max - value) / (max - min)) * chartHeight;
  const stepY = (value) => pad.top + ((stepMax - value) / stepMax) * chartHeight;

  drawGrid(ctx, { width, pad, min, max, step: 100, y, formatter: (v) => number.format(v) });
  drawRightAxis(ctx, { width, pad, min: 0, max: stepMax, step: stepMax / 4, y: stepY, formatter: (v) => number.format(v) });

  const barWidth = Math.max(4, Math.min(34, (chartWidth / rows.length) * 5.8));
  ctx.fillStyle = 'rgba(247, 178, 103, 0.38)';
  stepWeeks.forEach((week) => {
    const barHeight = pad.top + chartHeight - stepY(week.steps);
    ctx.fillRect(x(week.index) - barWidth / 2, stepY(week.steps), barWidth, barHeight);
  });

  drawLine(ctx, rows.map((row, i) => {
    const tdee = estimateTdee(rows, i);
    return Number.isFinite(tdee) ? { x: x(i), y: y(tdee) } : null;
  }).filter(Boolean), '#72ddf7', 3);
}

function avg(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function shortDate(date) {
  return date.slice(5).replace('-', '/');
}

function renderWeeklyAverages(rows) {
  const el = document.getElementById('weekly-table-wrap');
  const weeks = [];
  for (let start = 0; start < rows.length; start += 7) {
    const weekRows = rows.slice(start, start + 7);
    weeks.push({
      label: `Week ${weeks.length + 1}`,
      range: `${shortDate(weekRows[0].date)} – ${shortDate(weekRows.at(-1).date)}`,
      weight: avg(weekRows.map((row) => row.weight_lbs)),
      bodyfat: avg(weekRows.map((row) => row.bodyfat_percent)),
      calories: avg(weekRows.map((row) => row.calories)),
      steps: avg(weekRows.map((row) => row.steps)),
      protein: avg(weekRows.map((row) => row.protein_g)),
      tdee: avg(weekRows.map((row) => estimateTdee(rows, rows.indexOf(row)))),
    });
  }

  weeks.forEach((week, i) => {
    const previousWeek = weeks[i - 1];
    week.weeklyLoss = Number.isFinite(week.weight) && Number.isFinite(previousWeek?.weight)
      ? week.weight - previousWeek.weight
      : null;
  });

  el.innerHTML = `<table class="weekly-table">
    <thead>
      <tr>
        <th>Week</th>
        <th>Range</th>
        <th>Weight</th>
        <th>Weekly loss</th>
        <th>DEXA-est. BF</th>
        <th>Cals</th>
        <th>Steps</th>
        <th>Protein</th>
        <th>Est. TDEE</th>
      </tr>
    </thead>
    <tbody>
      ${weeks.reverse().map((week) => `<tr>
        <td>${week.label}</td>
        <td>${week.range}</td>
        <td>${fmt(week.weight, oneDecimal, ' lb')}</td>
        <td>${fmt(week.weeklyLoss, oneDecimal, ' lb')}</td>
        <td>${fmt(week.bodyfat, oneDecimal, '%')}</td>
        <td>${fmt(week.calories)}</td>
        <td>${fmt(week.steps)}</td>
        <td>${fmt(week.protein, number, 'g')}</td>
        <td>${fmt(week.tdee)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function drawGrid(ctx, { width, pad, min, max, step, y, formatter }) {
  ctx.strokeStyle = '#2a3546';
  ctx.fillStyle = '#9facbd';
  for (let value = min; value <= max + step / 2; value += step) {
    const ty = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, ty);
    ctx.lineTo(width - pad.right, ty);
    ctx.stroke();
    ctx.fillText(formatter(value), 8, ty + 4);
  }
}

function drawRightAxis(ctx, { width, pad, min, max, step, y, formatter }) {
  ctx.fillStyle = '#9facbd';
  for (let value = min; value <= max + step / 2; value += step) {
    ctx.fillText(formatter(value), width - pad.right + 8, y(value) + 4);
  }
}

function drawDateLabels(ctx, rows, { height, x }) {
  ctx.fillStyle = '#9facbd';
  rows.forEach((row, i) => {
    if (i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 5) === 0) {
      ctx.fillText(row.date.slice(5), x(i) - 14, height - 15);
    }
  });
}

function niceMax(values) {
  const max = Math.max(...values.filter(Number.isFinite), 1);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function updateChartChrome() {
  const configs = {
    weight: {
      title: 'Weight trend',
      description: 'Daily weight with a 7-day moving average when enough data exists.',
      legend: '<span><i class="dot weight"></i> Weight</span><span><i class="dot average"></i> 7-day avg</span>',
    },
    steps: {
      title: 'Steps trend',
      description: 'Daily steps as bars with weekly average steps as a line on the right axis.',
      legend: '<span><i class="dot weight"></i> Daily steps</span><span><i class="dot average"></i> 7-day avg</span>',
    },
    tdee: {
      title: 'Estimated TDEE',
      description: '35-day rolling TDEE estimate based on calories and smoothed weight change, with weekly average steps on the right axis.',
      legend: '<span><i class="dot weight"></i> Est. TDEE</span><span><i class="dot average"></i> Weekly avg steps</span>',
    },
    weekly: {
      title: 'Weekly averages',
      description: 'Weekly averages for the daily log, newest week first.',
      legend: '',
    },
  };
  const config = configs[activeMetric];
  document.getElementById('chart-title').textContent = config.title;
  document.getElementById('chart-description').textContent = config.description;
  document.getElementById('chart-legend').innerHTML = config.legend;
  document.querySelectorAll('.chart-toggle').forEach((button) => {
    button.classList.toggle('active', button.dataset.metric === activeMetric);
  });
}

function drawLine(ctx, points, color, width) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
}

function renderTable(rows) {
  const tbody = document.getElementById('daily-table');
  tbody.innerHTML = rows.map((row, i) => {
    const tdee = estimateTdee(rows, i);
    return `<tr>
      <td>${row.date}</td>
      <td>${fmt(row.weight_lbs, oneDecimal, ' lb')}</td>
      <td>${fmt(row.bodyfat_percent, oneDecimal, '%')}</td>
      <td>${fmt(row.calories)}</td>
      <td>${fmt(row.steps)}</td>
      <td>${fmt(row.protein_g, number, 'g')}</td>
      <td>${fmt(row.carbs_g, number, 'g')}</td>
      <td>${fmt(row.fat_g, number, 'g')}</td>
      <td>${fmt(tdee)}</td>
    </tr>`;
  }).reverse().join('');
}

function renderSummary(rows) {
  const latest = [...rows].reverse().find((row) => Number.isFinite(row.weight_lbs)) ?? rows.at(-1);
  const weightedRows = rows.filter((row) => Number.isFinite(row.weight_lbs));
  const prior = weightedRows.at(-8) ?? weightedRows[0] ?? latest;
  const weightChange = latest.weight_lbs - prior.weight_lbs;
  const avgSteps = rows.slice(-7).reduce((sum, row) => sum + row.steps, 0) / Math.min(7, rows.length);
  const latestTdee = estimateTdee(rows, rows.length - 1);

  document.getElementById('summary-card').innerHTML = `<div class="status-grid">
    <span><strong>${fmt(latest.weight_lbs, oneDecimal, ' lb')}</strong>latest weight</span>
    <span><strong>${fmt(latest.bodyfat_percent, oneDecimal, '%')}</strong>DEXA-est. body fat</span>
    <span><strong>${Number.isFinite(weightChange) && weightChange > 0 ? '+' : ''}${fmt(weightChange, oneDecimal, ' lb')}</strong>7-day change</span>
    <span><strong>${latestTdee ? number.format(latestTdee) : '—'}</strong>est. TDEE</span>
  </div>`;
}

async function loadDashboard() {
  const cacheBust = Date.now();
  const [dataRes, statusRes] = await Promise.all([
    fetch(`${DATA_URL}?v=${cacheBust}`),
    fetch(`${STATUS_URL}?v=${cacheBust}`).catch(() => null),
  ]);
  if (!dataRes.ok) throw new Error(`Could not load ${DATA_URL}`);
  const rows = parseCsv(await dataRes.text());
  renderSummary(rows);
  dashboardRows = rows;
  updateChartChrome();
  drawMetricChart(rows);
  renderTable(rows);
  if (statusRes?.ok) renderSyncStatus(await statusRes.json());
  else renderSyncStatus(null);
}

document.getElementById('reload-button').addEventListener('click', loadDashboard);
document.querySelectorAll('.chart-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    activeMetric = button.dataset.metric;
    updateChartChrome();
    drawMetricChart(dashboardRows);
  });
});
window.addEventListener('resize', () => drawMetricChart(dashboardRows));
loadDashboard().catch((error) => {
  document.getElementById('summary-card').textContent = error.message;
  console.error(error);
});
