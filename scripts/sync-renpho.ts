import { syncRenpho } from '../lib/renpho';

const trigger = process.argv[2] || 'cli';
const summary = syncRenpho(trigger);
console.log(JSON.stringify(summary, null, 2));
