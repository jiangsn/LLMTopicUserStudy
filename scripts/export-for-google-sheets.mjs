import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, toCsv } from './lib/csv.mjs';
import { alignedRating } from './lib/study-data.mjs';

const [inputArg, outputArg = 'google-sheets-export'] = process.argv.slice(2);
if (!inputArg) {
  console.error('Usage: node scripts/export-for-google-sheets.mjs <revisit-tidy.csv> [output-directory]');
  process.exit(1);
}

function parseAnswer(value) {
  if (value === '' || value === undefined) return '';
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function booleanValue(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function pivotRevisitTidy(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.participantId, row.trialId, row.trialOrder].join('\u0000');
    const group = groups.get(key) ?? {
      participantId: row.participantId,
      componentTrialId: row.trialId,
      trialOrder: row.trialOrder,
      status: row.status,
      answers: {},
      parameters: {},
    };
    if (row.responseId && row.responseId !== 'windowEvents') {
      group.answers[row.responseId] = parseAnswer(row.answer);
    }
    for (const [header, value] of Object.entries(row)) {
      if (header.startsWith('parameters_')) {
        group.parameters[header.slice('parameters_'.length)] = parseAnswer(value);
      }
    }
    if (row.status) group.status = row.status;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function normalizeTrial(answer, parameters, group) {
  const cannotJudge = booleanValue(answer.cannotJudge);
  const rawRating = cannotJudge || answer.rawRating === '' || answer.rawRating === null
    ? null
    : Number(answer.rawRating);
  const direction = answer.questionDirection || parameters.questionDirection;
  const startedAt = Number(answer.startedAt) || null;
  const completedAt = Number(answer.completedAt) || null;
  return {
    participantId: answer.participantId || group.participantId,
    prolificPid: answer.prolificPid || '',
    prolificStudyId: answer.prolificStudyId || '',
    prolificSessionId: answer.prolificSessionId || '',
    studyVersion: answer.studyVersion || parameters.studyVersion || '',
    trialId: answer.trialId || parameters.trialId || group.componentTrialId,
    filename: answer.filename || parameters.filename || '',
    imageUrl: answer.imageUrl || parameters.imageUrl || '',
    visType: answer.visType || parameters.visType || '',
    normalizedVC: answer.normalizedVC ?? parameters.normalizedVC ?? '',
    llmExtraTopic: answer.llmExtraTopic || parameters.llmExtraTopic || '',
    questionText: answer.questionText || parameters.questionText || '',
    questionMode: answer.questionMode || parameters.questionMode || '',
    questionDirection: direction,
    selectedLlmEvidence: answer.selectedLlmEvidence || parameters.selectedLlmEvidence || '',
    imageOrder: answer.imageOrder ?? '',
    questionOrder: answer.questionOrder ?? '',
    pageOrder: group.trialOrder,
    rawRating,
    alignedRating: cannotJudge ? null : alignedRating(rawRating, direction),
    cannotJudge,
    cannotJudgeComment: answer.cannotJudgeComment || '',
    responseTimeMs: answer.responseTimeMs ?? (startedAt && completedAt ? completedAt - startedAt : ''),
    revisionCount: answer.revisionCount ?? 0,
    viewport: answer.viewport || '',
    startedAt,
    completedAt,
    zoomEvents: answer.zoomEvents ?? 0,
    spaceAdvanceEvents: answer.spaceAdvanceEvents ?? 0,
    attentionCheckEnabled: booleanValue(answer.attentionCheckEnabled),
    completionStatus: group.status || 'recorded',
  };
}

const input = await readFile(path.resolve(inputArg), 'utf8');
const sourceRows = parseCsv(input);
if (!sourceRows.every((row) => 'participantId' in row && 'trialId' in row && 'responseId' in row)) {
  throw new Error('Input is not a reVISit tidy CSV (participantId, trialId, and responseId columns are required).');
}

const groups = pivotRevisitTidy(sourceRows);
const responseRows = groups
  .flatMap((group) => {
    const matrixResponses = group.answers.responses;
    if (matrixResponses && typeof matrixResponses === 'object' && !Array.isArray(matrixResponses)) {
      return Object.values(matrixResponses).map((answer) => normalizeTrial(answer, {}, group));
    }
    if (group.componentTrialId.startsWith('trial--') || group.answers.trialId) {
      return [normalizeTrial(group.answers, group.parameters, group)];
    }
    return [];
  })
  .sort((left, right) => left.participantId.localeCompare(right.participantId)
    || Number(left.imageOrder) - Number(right.imageOrder)
    || Number(left.questionOrder) - Number(right.questionOrder));

const demographicsByParticipant = new Map(
  groups
    .filter((group) => group.componentTrialId === 'demographics')
    .map((group) => [group.participantId, group.answers]),
);
const feedbackByParticipant = new Map(
  groups
    .filter((group) => group.componentTrialId === 'endFeedback')
    .map((group) => [group.participantId, group.answers]),
);

const participantMap = new Map();
for (const row of responseRows) {
  const key = row.participantId || row.prolificPid;
  if (!key) continue;
  const demographics = demographicsByParticipant.get(row.participantId) ?? {};
  const feedback = feedbackByParticipant.get(row.participantId) ?? {};
  const current = participantMap.get(key) ?? {
    participantId: row.participantId,
    prolificPid: row.prolificPid,
    prolificStudyId: row.prolificStudyId,
    prolificSessionId: row.prolificSessionId,
    studyVersion: row.studyVersion,
    workerId: demographics.workerId ?? '',
    retake: demographics.retake ?? '',
    gender: demographics.gender ?? '',
    genderSelfDescription: demographics.genderSelfDescription ?? '',
    ageCategory: demographics.ageCategory ?? '',
    education: demographics.education ?? '',
    complexVisualizationExperience: demographics.complexVisualizationExperience ?? '',
    overallExperienceRating: feedback.overallExperienceRating ?? '',
    overallComments: feedback.overallComments ?? '',
    firstResponseAt: row.startedAt,
    lastResponseAt: row.completedAt,
    completedTrials: 0,
    cannotJudgeCount: 0,
    completionStatus: row.completionStatus,
  };
  current.firstResponseAt = Math.min(
    Number(current.firstResponseAt) || Infinity,
    Number(row.startedAt) || Infinity,
  );
  current.lastResponseAt = Math.max(
    Number(current.lastResponseAt) || 0,
    Number(row.completedAt) || 0,
  );
  current.completedTrials += 1;
  current.cannotJudgeCount += row.cannotJudge ? 1 : 0;
  if (row.completionStatus === 'completed') current.completionStatus = 'completed';
  participantMap.set(key, current);
}

const participants = [...participantMap.values()].map((row) => ({
  ...row,
  firstResponseAt: Number.isFinite(row.firstResponseAt) ? row.firstResponseAt : '',
  complete29: row.completedTrials === 29,
}));

const output = path.resolve(outputArg);
await mkdir(output, { recursive: true });
const responseHeaders = Object.keys(responseRows[0] ?? {});
const participantHeaders = Object.keys(participants[0] ?? {});
await writeFile(path.join(output, 'responses.csv'), toCsv(responseRows, responseHeaders), 'utf8');
await writeFile(path.join(output, 'participants.csv'), toCsv(participants, participantHeaders), 'utf8');
console.log(`Wrote ${participants.length} participant rows and ${responseRows.length} response rows to ${output}.`);
