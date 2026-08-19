# Production deployment runbook

The participant-facing site is hosted by GitHub Pages. Firebase is the only live
write backend; Google Sheets receives exported snapshots only. Production remains
intentionally blocked until the consent determination, Firebase project, and Prolific
completion URL are supplied.

## 1. Non-engineering launch gates

- Obtain written confirmation from Jian Chen or OSU ORRP stating the applicable IRB,
  exempt, or non-human-subjects determination. Replace
  `public/llm-topic-user-study/assets/consent.production.md` only with the confirmed
  text, then set `STUDY_CONSENT_APPROVED=true`.
- Confirm the consent states the $2.00 payment, Prolific identifiers, Firebase/cloud
  storage, open response, retention period, withdrawal boundary, and contacts.
- Create the Prolific draft but do not publish it until staging QA passes.

## 2. Firebase project

Use the `jiang.sn.me@gmail.com` account and a dedicated project in `us-central1`.
Disable Analytics. Enable Anonymous and Google Authentication, Firestore, Storage,
and App Check with reCAPTCHA v3. Register `jiangsn.github.io` as an authorized domain.

Before recruitment:

1. Review Blaze billing and bind a payment method manually; set a $5/month budget
   alert. This repository never performs the billing step automatically.
2. Run `yarn firebase:rules:test` locally and in CI.
3. Deploy `firebase/firestore.rules`, `firebase/storage.rules`, and
   `firebase/firestore.indexes.json` to the dedicated project.
4. Enable App Check enforcement for Firestore and Storage only after staging works.
5. Confirm modes are exactly: `dataCollectionEnabled=true`,
   `developmentModeEnabled=false`, and `dataSharingEnabled=false`.

The production app uses the anonymous Firebase Auth UID as `participantId`.
`PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID` are stored separately in answer data.

## 3. GitHub Pages environment

Set Pages source to **GitHub Actions**. Create a protected GitHub environment named
`production` and add these secrets:

- `VITE_FIREBASE_CONFIG`: the Firebase web config object on one line.
- `VITE_RECAPTCHAV3TOKEN`: the reCAPTCHA v3 site key used by App Check.
- `STUDY_CONTACT_EMAIL`: the approved study contact address.
- `STUDY_CONSENT_APPROVED`: literal `true` only after written confirmation.
- `PROLIFIC_COMPLETION_URL`: `https://app.prolific.com/submissions/complete?cc=CODE`.

Every push to `main` runs data tests, Rules emulator tests, type checking, the launch
guard, a Vite production build, and Pages deployment. The guard rejects localStorage,
pilot wording/version, missing recruitment parameters, unsafe Rules, missing App
Check/Firebase/Prolific values, and unapproved consent.

## 4. Prolific draft

- Payment: $2.00 fixed reward.
- Eligibility: fluent English, approval rate at least 95%, desktop/laptop; no country
  restriction.
- Target: soft launch 10, pause, then 40 more if no participant-facing or schema
  change. Otherwise increment the version and recruit a fresh target of 50.
- Entry URL must include Prolific's `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`
  placeholders. Missing parameters are blocked before a Firebase participant is made.
- Do not add an attention check. Speed, straight-lining, and Cannot-judge frequency
  are analysis flags, not automatic exclusions.

## 5. Staging and soft launch

Run Chrome and Edge checks at 1024x768, 1366x768, and 1920x1080. Verify all 10 image
pages/29 responses, Previous, Cannot judge, Space, hover lens, refresh recovery, and
Finish. Test 20 concurrent anonymous sessions, cross-account denials, App Check,
administrator export, and blocked public analysis routes.

After 10 paid responses, pause recruitment and save an immutable Firebase snapshot,
raw JSON, tidy CSV, and Sheets-ready `participants.csv`/`responses.csv`. Check median
duration, completion, duplicates, 29-row completeness, comments, and technical errors.
If median duration exceeds 10 minutes, pause and decide whether to raise payment or
shorten the study.

After 50 usable responses, close recruitment, set `dataCollectionEnabled=false`, and
make the final versioned snapshot/export.
