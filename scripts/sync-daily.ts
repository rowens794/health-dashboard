import { syncAllSources } from '../lib/sync';

const trigger = process.argv[2] || 'cli';
const summary = await syncAllSources(trigger);
console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  process.exitCode = 1;
}
