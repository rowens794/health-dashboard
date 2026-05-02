const DATA_URL = 'data/dashboard-health.csv';
const STATUS_URL = 'data/sync-status.json';
const TDEE_WINDOW_DAYS = 35;
const TDEE_MIN_DAYS = 28;

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmt(value, formatter = number, suffix = '') {
  return Number.isFinite(value) ? `${formatter.format(value)}${suffix}` : '—';
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

function movingAverage(rows, index, days = 7) {
  const slice = rows.slice(Math.max(0, index - days + 1), index + 1).filter((r) => Number.isFinite(r.weight_lbs));
  if (slice.length < days) return null;
  return slice.reduce((sum, row) => sum + row.weight_lbs, 0) / slice.length;
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
    el.innerHTML = '<div class="sync-item warn"><strong>No sync status yet</strong><span>Run scripts/sync_all.py once.</span></div>';
    return;
  }
  const sourceCards = Object.values(status.sources || {}).map((source) => `
    <div class="sync-item ${source.status === 'ok' ? 'ok' : 'warn'}">
      <strong>${source.label}</strong>
      <span>${source.status === 'ok' ? 'OK' : 'Needs attention'}</span>
      <small>${source.message || ''}</small>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="sync-item ${status.overall === 'ok' ? 'ok' : 'warn'}">
      <strong>Last run</strong>
      <span>${relativeTime(status.finished_at)}</span>
      <small>${status.finished_at || '—'}</small>
    </div>
    ${sourceCards}
  `;
}

function drawWeightChart(rows) {
  const canvas = document.getElementById('weight-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 24, right: 22, bottom: 44, left: 58 };
  const chartRows = rows.filter((row) => Number.isFinite(row.weight_lbs));
  const weights = chartRows.map((r) => r.weight_lbs).filter(Number.isFinite);
  const avgs = rows.map((_, i) => movingAverage(rows, i)).filter(Number.isFinite);
  const allValues = [...weights, ...avgs];
  const min = 165;
  const max = 215;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  const x = (i) => pad.left + (rows.length === 1 ? chartWidth / 2 : (i / (rows.length - 1)) * chartWidth);
  const y = (value) => pad.top + ((max - value) / (max - min)) * chartHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.lineWidth = 1;

  ctx.strokeStyle = '#2a3546';
  ctx.fillStyle = '#9facbd';
  for (let value = min; value <= max; value += 5) {
    const ty = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, ty);
    ctx.lineTo(width - pad.right, ty);
    ctx.stroke();
    ctx.fillText(`${oneDecimal.format(value)} lb`, 8, ty + 4);
  }

  ctx.fillStyle = '#9facbd';
  rows.forEach((row, i) => {
    if (i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 5) === 0) {
      ctx.fillText(row.date.slice(5), x(i) - 14, height - 15);
    }
  });

  drawLine(ctx, rows.map((row, i) => (Number.isFinite(row.weight_lbs) ? { x: x(i), y: y(row.weight_lbs), value: row.weight_lbs } : null)).filter(Boolean), '#72ddf7', 3);
  drawLine(ctx, rows.map((row, i) => {
    const avg = movingAverage(rows, i);
    return avg ? { x: x(i), y: y(avg), value: avg } : null;
  }).filter(Boolean), '#f7b267', 3);
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
  drawWeightChart(rows);
  renderTable(rows);
  if (statusRes?.ok) renderSyncStatus(await statusRes.json());
  else renderSyncStatus(null);
}

document.getElementById('reload-button').addEventListener('click', loadDashboard);
window.addEventListener('resize', () => loadDashboard().catch(console.error));
loadDashboard().catch((error) => {
  document.getElementById('summary-card').textContent = error.message;
  console.error(error);
});
