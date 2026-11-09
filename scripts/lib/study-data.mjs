import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from './csv.mjs';

export const STUDY_VERSION = 'production-2026-08-v1';
export const STUDY_DIR = 'llm-topic-user-study';
export const SNAPSHOT_PATH = path.join('public', STUDY_DIR, 'source', 'single-image-eval.snapshot.csv');
export const VALID_DIRECTIONS = new Set(['increasing', 'reducing']);
export const VALID_TOPICS = new Set([
  'Data Density / Image Clutter',
  'Visual Encoding Clarity',
  'Semantics / Text Legibility',
  'Color, Symbol, and Texture Details',
  'Immediacy / Cognitive Load',
  'Compositional Structure and Organization',
  'Aesthetics',
  'Schema',
]);

export const PLAIN_LANGUAGE_QUESTIONS = Object.freeze({
  'Data Density / Image Clutter': 'The visualization feels crowded or cluttered.',
  'Visual Encoding Clarity': 'It is difficult to tell what the visual marks—such as shapes, sizes, or positions—represent in the data.',
  'Semantics / Text Legibility': 'The labels, legends, axes, numbers, or other text are difficult to read or understand.',
  Schema: 'The overall chart or diagram structure is unfamiliar or hard to recognize.',
  'Color, Symbol, and Texture Details': 'The colors, symbols, textures, or 3D details are difficult to distinguish or understand.',
  'Aesthetics Uncertainty': 'The visual style makes the visualization feel unclear or unstable.',
  'Immediacy / Cognitive Load': 'Making sense of this visualization would take a lot of mental effort or time.',
});

export function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/[_.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function normalizeRow(row, index) {
  const filename = row.filename?.trim();
  const topic = (row.llm_extra_topic || row['llm extra topic'])?.trim();
  const direction = (row.question_direction || row['question direction'])?.trim().toLowerCase();
  const questionText = (row.survey_question || row['survey question'])?.trim();
  const plainLanguageQuestion = PLAIN_LANGUAGE_QUESTIONS[topic];
  const normalizedVC = Number(row.NormalizedVC || row.normalizedVC);
  const imageSlug = slugify(filename.replace(/\.[^.]+$/, ''));
  return {
    studyVersion: STUDY_VERSION,
    trialId: `trial--${imageSlug}--${slugify(topic)}-${String(index + 1).padStart(2, '0')}`,
    filename,
    imageSlug,
    imageUrl: `${STUDY_DIR}/assets/images/${encodeURIComponent(filename).replaceAll('%2F', '/')}`,
    visType: (row.VisType || row.visType)?.trim(),
    normalizedVC,
    llmExtraTopic: topic,
    questionText: plainLanguageQuestion,
    sourceQuestionText: questionText,
    genericQuestionText: plainLanguageQuestion,
    evidenceSpecificQuestionText: '',
    questionMode: 'generic',
    questionDirection: direction,
    selectedLlmEvidence: (row.selected_llm_evidence || row['selected llm evidence'])?.trim(),
    sourceRow: index + 2,
  };
}

export async function loadTrials(root = process.cwd()) {
  const csv = await readFile(path.join(root, SNAPSHOT_PATH), 'utf8');
  return parseCsv(csv)
    .filter((row) => row.filename?.trim())
    .map(normalizeRow);
}

export function validateTrials(trials) {
  const errors = [];
  if (trials.length !== 29) errors.push(`Expected 29 trials; found ${trials.length}.`);

  const filenames = new Set(trials.map((trial) => trial.filename));
  if (filenames.size !== 10) errors.push(`Expected 10 images; found ${filenames.size}.`);

  const ids = new Set();
  for (const trial of trials) {
    const required = [
      'trialId', 'filename', 'imageUrl', 'visType', 'llmExtraTopic',
      'questionText', 'questionDirection', 'selectedLlmEvidence',
    ];
    for (const field of required) {
      if (!trial[field]) errors.push(`Row ${trial.sourceRow}: missing ${field}.`);
    }
    if (!Number.isFinite(trial.normalizedVC)) {
      errors.push(`Row ${trial.sourceRow}: invalid normalizedVC.`);
    }
    if (ids.has(trial.trialId)) errors.push(`Duplicate trial ID: ${trial.trialId}.`);
    ids.add(trial.trialId);
    if (!VALID_DIRECTIONS.has(trial.questionDirection)) {
      errors.push(`Row ${trial.sourceRow}: illegal direction "${trial.questionDirection}".`);
    }
    if (!VALID_TOPICS.has(trial.llmExtraTopic)) {
      errors.push(`Row ${trial.sourceRow}: illegal topic "${trial.llmExtraTopic}".`);
    }
  }
  return errors;
}

export function groupByImage(trials) {
  return [...trials.reduce((groups, trial) => {
    const group = groups.get(trial.filename) ?? [];
    group.push(trial);
    groups.set(trial.filename, group);
    return groups;
  }, new Map()).entries()];
}

export function alignedRating(rawRating, direction) {
  if (rawRating === null || rawRating === undefined || rawRating === '') return null;
  const numeric = Number(rawRating);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 7) return null;
  return direction === 'reducing' ? 8 - numeric : numeric;
}
