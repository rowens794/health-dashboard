import { syncMyFitnessPal } from '../lib/myfitnesspal';

const trigger = process.argv[2] || 'cli';
const summary = syncMyFitnessPal(trigger);
console.log(JSON.stringify(summary, null, 2));
