import fs from 'node:fs';
import { chromium } from 'playwright';
import {
  MYFITNESSPAL_PUBLIC_DIARY_USERNAME,
  MYFITNESSPAL_PUBLIC_RECENT_DAYS,
  MYFITNESSPAL_BROWSER_PROFILE_PATH,
  MYFITNESSPAL_BROWSER_HEADLESS,
  MYFITNESSPAL_CHROME_PATH,
} from './config';
import { hasExistingNutritionDaily, upsertNutritionDaily } from './db';
import type { NutritionDailyRecord } from './types';

export async function syncMyFitnessPalPublicRecentDays() {
  const username = MYFITNESSPAL_PUBLIC_DIARY_USERNAME.trim();
  const recentDays = Math.max(0, MYFITNESSPAL_PUBLIC_RECENT_DAYS);
  if (!username || recentDays <= 0) {
    return {
      enabled: false,
      inserted: 0,
      updated: 0,
      scanned: 0,
      fetched: 0,
      skipped: 0,
      lastRecordAt: null as string | null,
      message: 'Public diary sync disabled.',
    };
  }

  fs.mkdirSync(MYFITNESSPAL_BROWSER_PROFILE_PATH, { recursive: true });
  const context = await chromium.launchPersistentContext(MYFITNESSPAL_BROWSER_PROFILE_PATH, {
    headless: MYFITNESSPAL_BROWSER_HEADLESS,
    executablePath: MYFITNESSPAL_CHROME_PATH || undefined,
  });

  let inserted = 0;
  let updated = 0;
  let scanned = 0;
  let fetched = 0;
  let skipped = 0;
  let lastRecordAt: string | null = null;

  try {
    const page = context.pages()[0] || (await context.newPage());

    for (const date of buildRecentDates(recentDays)) {
      scanned += 1;
      const url = `https://www.myfitnesspal.com/food/diary/${encodeURIComponent(username)}?date=${date}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(4_000);
        const title = await page.title();
        const bodyText = (await page.textContent('body')) || '';
        if (/Just a moment|Checking for secure connection|Enable JavaScript and cookies to continue/i.test(title + '\n' + bodyText)) {
          skipped += 1;
          continue;
        }

        const record = parseMyFitnessPalPublicPage(bodyText, date, url, username);
        if (!record) {
          skipped += 1;
          continue;
        }

        const existedBefore = hasExistingNutritionDaily('myfitnesspal', record.entryDate);
        upsertNutritionDaily(record);
        if (existedBefore) updated += 1;
        else inserted += 1;
        fetched += 1;
        lastRecordAt = `${record.entryDate}T00:00:00.000Z`;
      } catch {
        skipped += 1;
      }
    }
  } finally {
    await context.close();
  }

  return {
    enabled: true,
    inserted,
    updated,
    scanned,
    fetched,
    skipped,
    lastRecordAt,
    message:
      fetched > 0
        ? `Fetched ${fetched} public MyFitnessPal day(s) for ${username}.`
        : `Public MyFitnessPal fetch found no usable recent days for ${username}.`,
  };
}

export function parseMyFitnessPalPublicPage(bodyText: string, expectedDate: string, sourceUrl: string, username: string): NutritionDailyRecord | null {
  const compact = bodyText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const totalsMatch = compact.match(/Totals\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);
  if (!totalsMatch) return null;

  const calories = parseIntToken(totalsMatch[1]);
  const carbsG = parseIntToken(totalsMatch[2]);
  const fatG = parseIntToken(totalsMatch[3]);
  const proteinG = parseIntToken(totalsMatch[4]);
  if ([calories, carbsG, fatG, proteinG].some((value) => value === null)) return null;

  return {
    source: 'myfitnesspal',
    sourceUserId: username,
    entryDate: expectedDate,
    entryDateEpoch: Math.floor(new Date(`${expectedDate}T00:00:00Z`).getTime() / 1000),
    calories,
    proteinG,
    carbsG,
    fatG,
    sourceUrl,
    sourceType: 'public diary page',
    confidence: 'high',
    scrapedAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
  };
}

function parseIntToken(value: string) {
  const normalized = value.replace(/,/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function buildRecentDates(recentDays: number) {
  const dates: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < recentDays; offset += 1) {
    const current = new Date(today);
    current.setUTCDate(current.getUTCDate() - offset);
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}
