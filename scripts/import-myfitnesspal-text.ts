import fs from 'node:fs';
import { syncMyFitnessPalDiaryText } from '../lib/myfitnesspal-text';

const inputPath = process.argv[2];
const trigger = process.argv[3] || 'manual-text';

if (!inputPath) {
  console.error('Usage: tsx scripts/import-myfitnesspal-text.ts <text-file> [trigger]');
  process.exit(1);
}

const rawText = fs.readFileSync(inputPath, 'utf8');
const summary = syncMyFitnessPalDiaryText(rawText, trigger);
console.log(JSON.stringify(summary, null, 2));

if (summary.status !== 'ok') {
  process.exitCode = 1;
}
