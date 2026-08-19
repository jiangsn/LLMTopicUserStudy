import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from './lib/csv.mjs';
import {
  normalizeRow, SNAPSHOT_PATH, validateTrials,
} from './lib/study-data.mjs';

const spreadsheetId = '16WWxJHgozxC7amFVVbz7Ywr4d4ovfXqJ-MA6pTiDliA';
const sheetName = 'single-image-eval';
const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
const shouldWrite = process.argv.includes('--write');

const response = await fetch(url);
if (!response.ok) throw new Error(`Google Sheet request failed: ${response.status} ${response.statusText}`);
const csv = await response.text();
const rows = parseCsv(csv);
const dataRows = rows.filter((row) => row.filename?.trim());
const trials = dataRows.map(normalizeRow);
const errors = validateTrials(trials);
if (errors.length > 0) throw new Error(`Downloaded sheet failed validation:\n${errors.join('\n')}`);

if (shouldWrite) {
  await writeFile(path.join(process.cwd(), SNAPSHOT_PATH), csv, 'utf8');
  console.log(`Updated ${SNAPSHOT_PATH}. Run yarn study:prepare and review the diff.`);
} else {
  console.log(`Remote sheet is valid (${trials.length} trials; ${rows.length - dataRows.length} non-trial note row ignored). Re-run with --write to replace the snapshot.`);
}
