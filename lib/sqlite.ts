import { execFileSync } from 'node:child_process';

export function sqliteQuery(dbPath: string, sql: string) {
  return execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    env: { ...process.env },
  }).trim();
}

export function sqliteReadonlyQuery(dbPath: string, sql: string) {
  return execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
    encoding: 'utf8',
    env: { ...process.env },
  }).trim();
}

export function sqliteExec(dbPath: string, sql: string) {
  return execFileSync('sqlite3', [dbPath, sql], {
    encoding: 'utf8',
    env: { ...process.env },
  });
}

export function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}
