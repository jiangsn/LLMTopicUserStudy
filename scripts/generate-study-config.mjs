import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  groupByImage, loadTrials, STUDY_DIR, STUDY_VERSION, validateTrials,
} from './lib/study-data.mjs';
import { FEATURE_FLAGS } from '../study-settings.mjs';

const root = process.cwd();
let productionEnv = {};
try {
  productionEnv = Object.fromEntries(
    (await readFile(path.join(root, '.env.production'), 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
} catch {
  // Local pilots do not need a production environment file.
}

const env = { ...productionEnv, ...process.env };
const isProduction = env.VITE_STORAGE_ENGINE === 'firebase';
const completionUrl = env.PROLIFIC_COMPLETION_URL?.trim() ?? '';
let completionCode = '';
try {
  completionCode = completionUrl ? new URL(completionUrl).searchParams.get('cc') ?? '' : '';
} catch {
  // Launch readiness validation reports malformed completion URLs.
}
const trials = await loadTrials(root);
const errors = validateTrials(trials);
if (errors.length > 0) throw new Error(errors.join('\n'));

const featureFlags = {
  ...FEATURE_FLAGS,
  storageEngine: env.VITE_STORAGE_ENGINE === 'firebase' ? 'firebase' : 'localStorage',
};

const components = {
  consent: {
    type: 'markdown',
    path: `${STUDY_DIR}/assets/${isProduction ? 'consent.production.md' : 'consent.md'}`,
    nextButtonText: 'I agree — continue',
    previousButton: false,
    response: [{
      id: 'consent',
      prompt: 'Consent',
      location: 'belowStimulus',
      type: 'checkbox',
      options: [{
        label: 'I have read the information above and agree to participate.',
        value: 'agreed',
      }],
      required: true,
      requiredValue: ['agreed'],
      minSelections: 1,
      maxSelections: 1,
    }],
  },
  demographics: {
    type: 'react-component',
    path: `${STUDY_DIR}/DemographicsScreen.tsx`,
    previousButton: false,
    response: [],
  },
  instructions: {
    type: 'react-component',
    path: `${STUDY_DIR}/InstructionScreen.tsx`,
    parameters: featureFlags,
    response: [],
    previousButton: false,
    nextButtonText: 'Start the study',
  },
  endFeedback: {
    type: 'react-component',
    path: `${STUDY_DIR}/EndFeedback.tsx`,
    previousButton: featureFlags.allowPrevious,
    previousButtonText: 'Previous',
    nextButtonText: 'Submit feedback',
    response: [],
  },
  thanks: {
    type: 'markdown',
    path: `${STUDY_DIR}/assets/${isProduction ? 'thanks.production.md' : 'thanks.md'}`,
    previousButton: false,
    nextButtonText: 'Finish',
    response: [],
  },
};

const preparedTrials = trials.map((trial) => {
  const questionText = featureFlags.questionMode === 'evidence-specific'
    ? trial.evidenceSpecificQuestionText
    : trial.genericQuestionText;
  if (!questionText) {
    throw new Error(`No question text for ${trial.trialId} in ${featureFlags.questionMode} mode.`);
  }
  return {
    ...trial,
    questionText,
    questionMode: featureFlags.questionMode,
  };
});

const imageComponents = groupByImage(preparedTrials).map(([, imageTrials]) => {
  const imageId = `image--${imageTrials[0].imageSlug}`;
  components[imageId] = {
    type: 'react-component',
    path: `${STUDY_DIR}/TopicAlignmentTrial.tsx`,
    response: [],
    previousButton: featureFlags.allowPrevious,
    previousButtonText: 'Previous',
    meta: {
      hidePreviousWhenPreviousComponent: 'instructions',
    },
    nextButtonText: 'Next',
    nextOnEnter: false,
    parameters: {
      imageSlug: imageTrials[0].imageSlug,
      filename: imageTrials[0].filename,
      imageUrl: imageTrials[0].imageUrl,
      questions: imageTrials,
      featureFlags,
    },
  };
  return imageId;
});

if (featureFlags.enableAttentionChecks) {
  components.attentionCheck = {
    type: 'questionnaire',
    instruction: 'This item checks that you are reading the response options.',
    previousButton: featureFlags.allowPrevious,
    response: [{
      id: 'attentionCheck',
      prompt: 'For this attention check, please select **Slightly agree**.',
      type: 'radio',
      options: [
        { label: 'Strongly disagree', value: '1' },
        { label: 'Disagree', value: '2' },
        { label: 'Slightly disagree', value: '3' },
        { label: 'Neutral', value: '4' },
        { label: 'Slightly agree', value: '5' },
        { label: 'Agree', value: '6' },
        { label: 'Strongly agree', value: '7' },
      ],
      required: true,
    }],
    correctAnswer: [{ id: 'attentionCheck', answer: '5' }],
    meta: { isAttentionCheck: true },
  };
}

const allImageBlocks = {
  id: 'all-image-blocks',
  order: 'latinSquare',
  components: imageComponents,
  ...(featureFlags.enableAttentionChecks ? {
    interruptions: [{
      firstLocation: 5,
      spacing: 10,
      components: ['attentionCheck'],
    }],
  } : {}),
};

const config = {
  $schema: 'https://raw.githubusercontent.com/revisit-studies/study/v2.4.3/src/parser/StudyConfigSchema.json',
  studyMetadata: {
    title: 'LLM–Human Topic Alignment Study',
    version: STUDY_VERSION,
    authors: ['Shuning Jiang', 'Jian Chen'],
    date: '2026-08-19',
    description: isProduction
      ? 'Agreement with visualization-complexity statements proposed by an LLM.'
      : 'Local pilot of agreement with visualization-complexity statements proposed by an LLM.',
    organizations: ['The Ohio State University'],
  },
  uiConfig: {
    logoPath: 'revisitAssets/revisitLogoSquare.svg',
    contactEmail: env.STUDY_CONTACT_EMAIL || 'jiang.2126@osu.edu',
    withProgressBar: true,
    withSidebar: false,
    showTitle: false,
    nextOnEnter: true,
    nextButtonText: 'Next',
    previousButtonText: 'Previous',
    autoDownloadStudy: false,
    studyEndMsg: isProduction
      ? [
        '# Submission confirmed',
        '',
        'Your responses have been uploaded successfully.',
        'You will be redirected to Prolific automatically.',
        completionCode ? `Completion code: **${completionCode}**.` : '',
        completionUrl ? `[Return to Prolific](${completionUrl}) if the redirect does not open.` : '',
      ].filter(Boolean).join('\n')
      : 'Thank you for participating. Your response has been saved locally for this pilot.',
    ...(!isProduction ? { urlParticipantIdParam: 'PROLIFIC_PID' } : {}),
    numSequences: 500,
    stylesheetPath: `${STUDY_DIR}/assets/study.css`,
    ...(env.PROLIFIC_COMPLETION_URL ? {
      studyEndAutoRedirectURL: env.PROLIFIC_COMPLETION_URL,
      studyEndAutoRedirectDelay: 5000,
    } : {}),
  },
  studyRules: {
    display: {
      minWidth: 1024,
      minHeight: 768,
      blockedMessage: 'This study requires a browser viewport of at least 1024 × 768 pixels.',
    },
    devices: {
      allowed: ['desktop'],
      blockedMessage: 'Please complete this study on a desktop or laptop computer.',
    },
    browsers: {
      allowed: [{ name: 'chrome', minVersion: 110 }, { name: 'edge', minVersion: 110 }],
      blockedMessage: 'Please use a current version of Chrome or Microsoft Edge.',
    },
    inputs: {
      allowed: ['mouse'],
      blockedMessage: 'This study requires a mouse or trackpad.',
    },
  },
  components,
  sequence: {
    order: 'fixed',
    components: [
      'consent',
      'demographics',
      'instructions',
      allImageBlocks,
      'endFeedback',
      'thanks',
    ],
  },
};

const outputPath = path.join(root, 'public', STUDY_DIR, 'config.json');
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Generated ${outputPath} with ${trials.length} questions in ${imageComponents.length} image pages.`);
