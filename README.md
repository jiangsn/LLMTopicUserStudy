# LLM–Human Topic Alignment Online Study

Production-candidate implementation built on reVISit 2.4. It presents 29 LLM-extra-topic
statements across ten visualization images. Each image and its 1–5 statements appear
together in a seven-point Likert matrix.

## Run locally

Use Node 22 and Yarn 1.22 (the upstream reVISit template enforces Yarn):

```powershell
yarn install
yarn study:prepare
yarn serve
```

Open `http://localhost:8080/` and select **LLM–Human Topic Alignment Study**.
For a simulated Prolific participant, add
`?PROLIFIC_PID=test-worker-001&STUDY_ID=test-study&SESSION_ID=test-session`.

To inspect local pilot results in the same browser profile, open
`http://localhost:8080/analysis/stats/llm-topic-alignment` or use
**Analyze & Manage Study** on the landing page. Local-storage results do not follow
you to another browser/profile.

Local pilot answers are stored by reVISit in browser storage and can be downloaded
from reVISit's study/admin controls. Keep separate browser profiles or clear only this
study's browser data when simulating independent participants.

## Useful commands

```powershell
yarn data:validate
yarn study:generate
yarn study:test
yarn firebase:rules:test
yarn typecheck
yarn build
yarn study:browser-smoke
node scripts/export-for-google-sheets.mjs input.csv export-directory
```

`yarn build:production` intentionally fails until launch-critical consent, contact,
Firebase, and Prolific settings are supplied. See `DEPLOYMENT.md`.

## Layout

- `public/llm-topic-user-study/source/` — frozen Google Sheet-ready CSV snapshot.
- `public/llm-topic-user-study/assets/images/` — local formal-study stimuli.
- `src/public/llm-topic-user-study/` — custom demographics, instruction, matrix,
  and end-feedback screens.
- `scripts/` — data validation, config generation, launch guard, browser checks,
  and export conversion.
- `study-settings.mjs` — centralized zoom, attention-check, Previous,
  question-mode, and storage feature flags.
- `firebase/` — Firestore/Storage isolation rules and Firestore indexes.
- `tests/llm-topic-user-study/` — deterministic data, sequence, export, and
  browser-flow tests.

This version must not be used for recruitment until the production launch guard is
satisfied. Formal builds require Firebase/App Check, a Prolific completion URL, and
approved consent; see `DEPLOYMENT.md`.
