import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getMetadata,
  listAll,
  ref,
  uploadString,
} from 'firebase/storage';

const PROJECT_ID = 'llm-topic-alignment-rules-test';
const STUDY_ID = 'llm-topic-alignment';
const ADMIN_EMAIL = 'jiang.sn.me@gmail.com';

let testEnvironment;

const participantPath = (uid) => `${STUDY_ID}/participants/${uid}_participantData`;
const provenancePath = (uid) => `${STUDY_ID}/provenance/${uid}_image-01`;

const createPrivateAssignment = async (context, uid) => runTransaction(
  context.firestore(),
  async (transaction) => {
    const counterRef = doc(context.firestore(), STUDY_ID, 'sequenceCounter');
    const assignmentRef = doc(
      context.firestore(),
      STUDY_ID,
      'sequenceAssignment',
      'sequenceAssignment',
      uid,
    );
    const counter = await transaction.get(counterRef);
    const sequenceIndex = counter.exists() ? counter.data().nextIndex : 0;
    transaction.set(counterRef, { nextIndex: sequenceIndex + 1 });
    transaction.set(assignmentRef, {
      participantId: uid,
      sequenceIndex,
      sequence: sequenceIndex,
    });
  },
);

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      rules: await readFile(new URL('../../firebase/storage.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('anonymous participant storage is private to its Firebase UID', async () => {
  const participantA = testEnvironment.authenticatedContext('participant-a');
  const participantB = testEnvironment.authenticatedContext('participant-b');

  const ownParticipant = ref(participantA.storage(), participantPath('participant-a'));
  await assertSucceeds(uploadString(ownParticipant, JSON.stringify({ completed: false }), 'raw', {
    contentType: 'application/json',
  }));
  await assertSucceeds(getMetadata(ownParticipant));

  await assertFails(getMetadata(ref(participantB.storage(), participantPath('participant-a'))));
  await assertFails(uploadString(
    ref(participantB.storage(), participantPath('participant-a')),
    JSON.stringify({ completed: true }),
    'raw',
    { contentType: 'application/json' },
  ));
  await assertFails(listAll(ref(participantB.storage(), `${STUDY_ID}/participants`)));

  await assertSucceeds(uploadString(
    ref(participantA.storage(), provenancePath('participant-a')),
    JSON.stringify({ nodes: [] }),
    'raw',
    { contentType: 'application/json' },
  ));
  await assertFails(getMetadata(ref(participantB.storage(), provenancePath('participant-a'))));
});

test('administrator can inspect participant storage but anonymous users cannot enumerate it', async () => {
  const participant = testEnvironment.authenticatedContext('participant-a');
  const admin = testEnvironment.authenticatedContext('admin-uid', { email: ADMIN_EMAIL });

  await uploadString(
    ref(participant.storage(), participantPath('participant-a')),
    JSON.stringify({ completed: true }),
    'raw',
    { contentType: 'application/json' },
  );

  await assertSucceeds(getMetadata(ref(admin.storage(), participantPath('participant-a'))));
  const listing = await assertSucceeds(listAll(ref(admin.storage(), `${STUDY_ID}/participants`)));
  assert.equal(listing.items.length, 1);
});

test('shared Storage metadata is readable but cannot be overwritten by participants', async () => {
  const participantA = testEnvironment.authenticatedContext('participant-a');
  const participantB = testEnvironment.authenticatedContext('participant-b');
  const sequenceRefA = ref(participantA.storage(), `${STUDY_ID}/_sequenceArray`);

  await assertSucceeds(uploadString(sequenceRefA, JSON.stringify([[0, 1]]), 'raw', {
    contentType: 'application/json',
  }));
  await assertSucceeds(getMetadata(ref(participantB.storage(), `${STUDY_ID}/_sequenceArray`)));
  await assertFails(uploadString(
    ref(participantB.storage(), `${STUDY_ID}/_sequenceArray`),
    JSON.stringify([[1, 0]]),
    'raw',
    { contentType: 'application/json' },
  ));
  await assertFails(uploadString(
    ref(participantA.storage(), `${STUDY_ID}/unexpected_file`),
    JSON.stringify({ injected: true }),
    'raw',
    { contentType: 'application/json' },
  ));
});

test('only the administrator can create or change study modes', async () => {
  const participant = testEnvironment.authenticatedContext('participant-a');
  const admin = testEnvironment.authenticatedContext('admin-uid', { email: ADMIN_EMAIL });
  const modesRef = doc(participant.firestore(), STUDY_ID, 'modes');

  await assertFails(setDoc(modesRef, {
    dataCollectionEnabled: true,
    developmentModeEnabled: false,
    dataSharingEnabled: false,
  }));
  await assertSucceeds(setDoc(doc(admin.firestore(), STUDY_ID, 'modes'), {
    dataCollectionEnabled: true,
    developmentModeEnabled: false,
    dataSharingEnabled: false,
  }));
  assert.equal((await assertSucceeds(getDoc(modesRef))).data().dataSharingEnabled, false);
  await assertFails(updateDoc(modesRef, { dataSharingEnabled: true }));
});

test('Latin-square assignments are readable and writable only by their owner', async () => {
  const participantA = testEnvironment.authenticatedContext('participant-a');
  const participantB = testEnvironment.authenticatedContext('participant-b');
  const assignmentsA = collection(
    participantA.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
  );
  const ownAssignmentA = doc(assignmentsA, 'participant-a');

  await assertSucceeds(createPrivateAssignment(participantA, 'participant-a'));
  await assertFails(getDocs(collection(
    participantB.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
  )));
  await assertSucceeds(getDoc(ownAssignmentA));
  await assertFails(getDoc(doc(
    participantB.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
    'participant-a',
  )));
  await assertFails(updateDoc(doc(
    participantB.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
    'participant-a',
  ), { sequence: 1 }));
  await assertFails(setDoc(doc(
    participantB.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
    'forged-participant',
  ), { participantId: 'forged-participant', sequence: 2 }));
});

test('concurrent participants receive unique counter indices and cannot advance twice', async () => {
  const participantA = testEnvironment.authenticatedContext('participant-a');
  const participantB = testEnvironment.authenticatedContext('participant-b');
  const admin = testEnvironment.authenticatedContext('admin-uid', { email: ADMIN_EMAIL });

  await Promise.all([
    assertSucceeds(createPrivateAssignment(participantA, 'participant-a')),
    assertSucceeds(createPrivateAssignment(participantB, 'participant-b')),
  ]);

  const assignments = await assertSucceeds(getDocs(collection(
    admin.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
  )));
  assert.deepEqual(
    assignments.docs.map((snapshot) => snapshot.data().sequenceIndex).sort((a, b) => a - b),
    [0, 1],
  );
  await assertFails(updateDoc(doc(participantA.firestore(), STUDY_ID, 'sequenceCounter'), {
    nextIndex: 3,
  }));
});

test('administrator can enumerate participant assignments and update study modes', async () => {
  const participant = testEnvironment.authenticatedContext('participant-a');
  const admin = testEnvironment.authenticatedContext('admin-uid', { email: ADMIN_EMAIL });

  await setDoc(doc(admin.firestore(), STUDY_ID, 'modes'), {
    dataCollectionEnabled: true,
    developmentModeEnabled: false,
    dataSharingEnabled: false,
  });
  await createPrivateAssignment(participant, 'participant-a');

  await assertSucceeds(updateDoc(doc(admin.firestore(), STUDY_ID, 'modes'), {
    dataCollectionEnabled: false,
  }));
  const assignments = await assertSucceeds(getDocs(collection(
    admin.firestore(),
    STUDY_ID,
    'sequenceAssignment',
    'sequenceAssignment',
  )));
  assert.equal(assignments.size, 1);
});

test('unauthenticated requests cannot read study data', async () => {
  const anonymous = testEnvironment.unauthenticatedContext();
  await assertFails(getDoc(doc(anonymous.firestore(), STUDY_ID, 'modes')));
  await assertFails(getMetadata(ref(anonymous.storage(), `${STUDY_ID}/_sequenceArray`)));
});
