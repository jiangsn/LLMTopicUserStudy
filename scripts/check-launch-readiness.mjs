import { readFile } from 'node:fs/promises';
import path from 'node:path';

function parseEnv(text) {
  return Object.fromEntries(text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
}

let fileEnv = {};
try {
  fileEnv = parseEnv(await readFile(path.join(process.cwd(), '.env.production'), 'utf8'));
} catch {
  // A missing production file is reported through the required-field errors below.
}
const env = { ...fileEnv, ...process.env };
const errors = [];
const required = [
  'VITE_FIREBASE_CONFIG',
  'VITE_RECAPTCHAV3TOKEN',
  'STUDY_CONTACT_EMAIL',
  'PROLIFIC_COMPLETION_URL',
  'FIREBASE_RULES_TESTED',
];
for (const key of required) {
  if (!env[key]?.trim()) errors.push(`${key} is missing.`);
}
if (env.VITE_STORAGE_ENGINE !== 'firebase') errors.push('VITE_STORAGE_ENGINE must be firebase.');
if (env.VITE_LAUNCH_READY !== 'true') errors.push('VITE_LAUNCH_READY must be true.');
if (env.VITE_REQUIRE_PROLIFIC_PARAMS !== 'true') errors.push('VITE_REQUIRE_PROLIFIC_PARAMS must be true.');
if (env.STUDY_CONSENT_APPROVED !== 'true') errors.push('STUDY_CONSENT_APPROVED must be true.');
if (env.FIREBASE_RULES_TESTED !== 'true') errors.push('FIREBASE_RULES_TESTED must be true after emulator tests pass.');
if (env.VITE_BASE_PATH !== '/LLMTopicUserStudy/') errors.push('VITE_BASE_PATH must be /LLMTopicUserStudy/.');
if (env.STUDY_CONTACT_EMAIL?.includes('example.')) errors.push('STUDY_CONTACT_EMAIL is still a placeholder.');
if (env.PROLIFIC_COMPLETION_URL && !/^https:\/\/app\.prolific\.com\/submissions\/complete\?cc=/.test(env.PROLIFIC_COMPLETION_URL)) {
  errors.push('PROLIFIC_COMPLETION_URL is not a Prolific completion URL.');
}
if (env.PROLIFIC_COMPLETION_URL) {
  try {
    if (!new URL(env.PROLIFIC_COMPLETION_URL).searchParams.get('cc')) {
      errors.push('PROLIFIC_COMPLETION_URL is missing a completion code.');
    }
  } catch {
    errors.push('PROLIFIC_COMPLETION_URL is not a valid URL.');
  }
}
if (env.VITE_FIREBASE_CONFIG && !/apiKey|projectId/.test(env.VITE_FIREBASE_CONFIG)) {
  errors.push('VITE_FIREBASE_CONFIG does not look like a Firebase web configuration object.');
}

const consent = await readFile(path.join(process.cwd(), 'public', 'llm-topic-user-study', 'assets', 'consent.production.md'), 'utf8');
if (/PLACEHOLDER|REPLACE|APPROVAL REQUIRED|NOT FOR RECRUITMENT/i.test(consent)) {
  errors.push('Production consent text is not approved or still contains replacement markers.');
}

const studyData = await readFile(path.join(process.cwd(), 'scripts', 'lib', 'study-data.mjs'), 'utf8');
if (/STUDY_VERSION\s*=\s*['"]pilot/i.test(studyData)) errors.push('Study version is still marked as pilot.');

const generatedConfig = await readFile(path.join(process.cwd(), 'public', 'llm-topic-user-study', 'config.json'), 'utf8');
if (/\bpilot\b|saved locally|localStorage/i.test(generatedConfig)) {
  errors.push('Generated production config still contains pilot/local-storage behavior.');
}
if (/"urlParticipantIdParam"/.test(generatedConfig)) {
  errors.push('Generated production config still uses a recruitment ID as the reVISit participant ID.');
}
if (!/"studyEndAutoRedirectURL"/.test(generatedConfig)) {
  errors.push('Generated production config is missing the Prolific redirect.');
}

const settings = await readFile(path.join(process.cwd(), 'study-settings.mjs'), 'utf8');
if (!/enableAttentionChecks:\s*false/.test(settings)) errors.push('Attention checks must remain disabled for this launch.');
if (!/questionMode:\s*['"]generic['"]/.test(settings)) errors.push('Question mode must remain generic for this launch.');

const firestoreRules = await readFile(path.join(process.cwd(), 'firebase', 'firestore.rules'), 'utf8');
const storageRules = await readFile(path.join(process.cwd(), 'firebase', 'storage.rules'), 'utf8');
if (/match \/\{document=\*\*\}[\s\S]*allow read, write: if request\.auth != null/.test(firestoreRules)) {
  errors.push('Firestore rules still grant every authenticated user full access.');
}
if (/match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if request\.auth != null/.test(storageRules)) {
  errors.push('Storage rules still grant every authenticated user full access.');
}

if (errors.length > 0) {
  console.error(`Production launch blocked:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exit(1);
}
console.log('Production launch readiness checks passed.');
