import { syncGarmin } from '../lib/garmin';

const trigger = process.argv[2] || 'cli';
const summary = syncGarmin(trigger);
console.log(JSON.stringify(summary, null, 2));
