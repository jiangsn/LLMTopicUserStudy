import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  groupByImage, loadTrials, STUDY_DIR, validateTrials,
} from './lib/study-data.mjs';

const root = process.cwd();
const trials = await loadTrials(root);
const errors = validateTrials(trials);

for (const [filename] of groupByImage(trials)) {
  const imagePath = path.join(root, 'public', STUDY_DIR, 'assets', 'images', filename);
  try {
    await access(imagePath);
    const info = await stat(imagePath);
    if (!info.isFile() || info.size === 0) errors.push(`Image is empty or not a file: ${filename}.`);
  } catch {
    errors.push(`Missing local image: ${filename}.`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

const directions = Object.groupBy(trials, (trial) => trial.questionDirection);
console.log(`Validated ${new Set(trials.map((trial) => trial.filename)).size} images and ${trials.length} trials.`);
console.log(`Directions: increasing=${directions.increasing?.length ?? 0}, reducing=${directions.reducing?.length ?? 0}.`);
