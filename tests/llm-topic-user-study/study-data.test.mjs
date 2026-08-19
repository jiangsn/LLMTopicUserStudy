import assert from 'node:assert/strict';
import {
  mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  alignedRating, groupByImage, loadTrials, validateTrials,
} from '../../scripts/lib/study-data.mjs';
import { parseCsv, toCsv } from '../../scripts/lib/csv.mjs';

test('snapshot contains exactly ten images and 29 unique valid trials', async () => {
  const trials = await loadTrials();
  assert.deepEqual(validateTrials(trials), []);
  assert.equal(trials.length, 29);
  assert.equal(new Set(trials.map((trial) => trial.filename)).size, 10);
  assert.equal(new Set(trials.map((trial) => trial.trialId)).size, 29);
});

test('alignment coding reverses only reducing questions', () => {
  assert.equal(alignedRating(2, 'increasing'), 2);
  assert.equal(alignedRating(2, 'reducing'), 6);
  assert.equal(alignedRating(null, 'reducing'), null);
  assert.equal(alignedRating(8, 'increasing'), null);
});

test('participant-facing questions use self-contained plain language', async () => {
  const trials = await loadTrials();
  for (const trial of trials) {
    assert.ok(!trial.questionText.startsWith('To what extent'), trial.trialId);
    assert.ok(!/visual encoding|cognitive effort/i.test(trial.questionText), trial.trialId);
    assert.ok(trial.sourceQuestionText, trial.trialId);
  }
});

test('generated sequence has ten image pages containing all 29 questions', async () => {
  const trials = await loadTrials();
  const config = JSON.parse(await readFile(
    path.join(process.cwd(), 'public', 'llm-topic-user-study', 'config.json'),
    'utf8',
  ));
  const outer = config.sequence.components.find((component) => component.id === 'all-image-blocks');
  assert.equal(outer.order, 'latinSquare');
  assert.equal(outer.components.length, 10);

  const generatedTrialIds = outer.components.flatMap((componentId) => {
    assert.ok(componentId.startsWith('image--'));
    const component = config.components[componentId];
    assert.equal(component.path, 'llm-topic-user-study/TopicAlignmentTrial.tsx');
    assert.equal(component.previousButton, true);
    assert.equal(component.meta.hidePreviousWhenPreviousComponent, 'instructions');
    assert.equal(component.nextOnEnter, false);
    return component.parameters.questions.map((question) => question.trialId);
  });
  assert.deepEqual(new Set(generatedTrialIds), new Set(trials.map((trial) => trial.trialId)));
  assert.equal(generatedTrialIds.length, 29);

  const expectedCounts = new Map(groupByImage(trials).map(([filename, rows]) => [filename, rows.length]));
  for (const componentId of outer.components) {
    const component = config.components[componentId];
    const filenames = new Set(component.parameters.questions.map((question) => question.filename));
    assert.equal(filenames.size, 1);
    const [filename] = filenames;
    assert.equal(component.parameters.questions.length, expectedCounts.get(filename));
  }
});

test('demographics and end feedback use the custom standardized screens', async () => {
  const config = JSON.parse(await readFile(
    path.join(process.cwd(), 'public', 'llm-topic-user-study', 'config.json'),
    'utf8',
  ));
  assert.equal(config.components.demographics.type, 'react-component');
  assert.equal(config.components.demographics.path, 'llm-topic-user-study/DemographicsScreen.tsx');
  assert.equal(config.components.endFeedback.path, 'llm-topic-user-study/EndFeedback.tsx');
  assert.ok(config.sequence.components.includes('endFeedback'));
  assert.equal(config.components.endFeedback.previousButton, true);
});

test('instruction-only bar chart exists and zoom is enabled', async () => {
  const config = JSON.parse(await readFile(
    path.join(process.cwd(), 'public', 'llm-topic-user-study', 'config.json'),
    'utf8',
  ));
  const instructionImage = await readFile(path.join(
    process.cwd(),
    'public',
    'llm-topic-user-study',
    'assets',
    'economist_daily_chart_75.png',
  ));
  assert.ok(instructionImage.length > 0);
  const outer = config.sequence.components.find((component) => component.id === 'all-image-blocks');
  assert.ok(outer.components.every(
    (id) => config.components[id].parameters.featureFlags.enableImageZoom === true,
  ));
  assert.ok(!trialsContainInstructionImage(config, 'economist_daily_chart_75.png'));
});

function trialsContainInstructionImage(config, filename) {
  const outer = config.sequence.components.find((component) => component.id === 'all-image-blocks');
  return outer.components.some((id) => config.components[id].parameters.filename === filename);
}

test('ten cyclic Latin-square rows place every image once in every position', async () => {
  const trials = await loadTrials();
  const images = groupByImage(trials).map(([filename]) => filename);
  const rows = images.map((_, offset) => images.map((__, position) => images[(position + offset) % images.length]));
  for (let position = 0; position < images.length; position += 1) {
    assert.deepEqual(new Set(rows.map((row) => row[position])), new Set(images));
  }
});

test('all generated local image URLs resolve to nonempty files', async () => {
  const trials = await loadTrials();
  for (const trial of trials) {
    const assetPath = path.join(
      process.cwd(),
      'public',
      decodeURIComponent(trial.imageUrl),
    );
    const bytes = await readFile(assetPath);
    assert.ok(bytes.length > 0, trial.filename);
  }
});

test('Sheets export expands matrix responses and includes new participant fields', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'llm-topic-export-'));
  try {
    const headers = ['participantId', 'trialId', 'trialOrder', 'responseId', 'answer', 'status'];
    const shared = {
      participantId: 'participant-a',
      prolificPid: 'worker-a',
      prolificStudyId: 'prolific-study-a',
      prolificSessionId: 'prolific-session-a',
      studyVersion: 'matrix-test',
      filename: 'image.png',
      imageUrl: 'assets/image.png',
      visType: 'Bar',
      normalizedVC: 0.4,
      questionMode: 'generic',
      imageOrder: 1,
      viewport: '1366x768',
      startedAt: 1000,
      completedAt: 1500,
      responseTimeMs: 500,
      revisionCount: 0,
      zoomEvents: 1,
      spaceAdvanceEvents: 1,
    };
    const responses = {
      'trial--a': {
        ...shared,
        trialId: 'trial--a',
        llmExtraTopic: 'Schema',
        questionText: 'Question A',
        questionDirection: 'increasing',
        selectedLlmEvidence: 'Evidence A',
        questionOrder: 1,
        rawRating: 2,
        cannotJudge: false,
        cannotJudgeComment: '',
      },
      'trial--b': {
        ...shared,
        trialId: 'trial--b',
        llmExtraTopic: 'Data Density / Image Clutter',
        questionText: 'Question B',
        questionDirection: 'reducing',
        selectedLlmEvidence: 'Evidence B',
        questionOrder: 2,
        rawRating: null,
        cannotJudge: true,
        cannotJudgeComment: 'Not enough detail.',
      },
    };
    const rows = [
      ['workerId', 'worker-a'],
      ['retake', 'No'],
      ['gender', 'Prefer to self-describe'],
      ['genderSelfDescription', 'Self-described'],
      ['ageCategory', '26-35'],
      ['education', 'Graduate school'],
      ['complexVisualizationExperience', 'A dense network diagram.'],
    ].map(([responseId, answer]) => ({
      participantId: 'participant-a',
      trialId: 'demographics',
      trialOrder: 1,
      responseId,
      answer,
      status: 'completed',
    }));
    rows.push({
      participantId: 'participant-a',
      trialId: 'image--image',
      trialOrder: 4,
      responseId: 'responses',
      answer: JSON.stringify(responses),
      status: 'completed',
    });
    rows.push({
      participantId: 'participant-a',
      trialId: 'endFeedback',
      trialOrder: 14,
      responseId: 'overallExperienceRating',
      answer: '6',
      status: 'completed',
    });
    rows.push({
      participantId: 'participant-a',
      trialId: 'endFeedback',
      trialOrder: 14,
      responseId: 'overallComments',
      answer: 'Clear study.',
      status: 'completed',
    });

    const inputPath = path.join(temporary, 'tidy.csv');
    const outputPath = path.join(temporary, 'output');
    await writeFile(inputPath, toCsv(rows, headers), 'utf8');
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'export-for-google-sheets.mjs'),
      inputPath,
      outputPath,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const exportedResponses = parseCsv(await readFile(path.join(outputPath, 'responses.csv'), 'utf8'));
    assert.equal(exportedResponses.length, 2);
    assert.equal(exportedResponses[0].alignedRating, '2');
    assert.equal(exportedResponses[1].alignedRating, '');
    assert.equal(exportedResponses[1].cannotJudge, 'true');
    assert.equal(exportedResponses[0].prolificStudyId, 'prolific-study-a');
    assert.equal(exportedResponses[0].prolificSessionId, 'prolific-session-a');

    const [participant] = parseCsv(await readFile(path.join(outputPath, 'participants.csv'), 'utf8'));
    assert.equal(participant.workerId, 'worker-a');
    assert.equal(participant.prolificStudyId, 'prolific-study-a');
    assert.equal(participant.prolificSessionId, 'prolific-session-a');
    assert.equal(participant.genderSelfDescription, 'Self-described');
    assert.equal(participant.overallExperienceRating, '6');
    assert.equal(participant.overallComments, 'Clear study.');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
