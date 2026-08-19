import {
  Fragment, useEffect, useMemo, useRef, useState,
} from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { StimulusParams } from '../../store/types';
import { useFlatSequence, useStoreSelector } from '../../store/store';
import { useStoredAnswer } from '../../store/hooks/useStoredAnswer';
import { useNextStep } from '../../store/hooks/useNextStep';
import './TopicAlignmentTrial.css';

type FeatureFlags = {
  enableImageZoom: boolean;
  enableAttentionChecks: boolean;
  allowPrevious: boolean;
  questionMode: 'generic' | 'evidence-specific';
  storageEngine: 'localStorage' | 'firebase';
};

type Question = {
  studyVersion: string;
  trialId: string;
  filename: string;
  imageSlug: string;
  imageUrl: string;
  visType: string;
  normalizedVC: number;
  llmExtraTopic: string;
  questionText: string;
  questionMode: 'generic' | 'evidence-specific';
  questionDirection: 'increasing' | 'reducing';
  selectedLlmEvidence: string;
};

type ImageTrialParameters = {
  imageSlug: string;
  filename: string;
  imageUrl: string;
  questions: Question[];
  featureFlags: FeatureFlags;
};

type RowState = {
  rawRating: number | null;
  cannotJudge: boolean;
  cannotJudgeComment: string;
  answeredAt: number | null;
};

type StoredResponse = RowState & {
  responseTimeMs?: number;
  revisionCount?: number;
  startedAt?: number;
  completedAt?: number | null;
};

const SCALE_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Slightly disagree',
  'Neutral',
  'Slightly agree',
  'Agree',
  'Strongly agree',
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(values: T[], seedText: string) {
  const shuffled = [...values];
  let state = hashString(seedText) || 1;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function initialRows(questions: Question[], stored: Record<string, StoredResponse>) {
  return Object.fromEntries(questions.map((question) => {
    const previous = stored[question.trialId];
    return [question.trialId, {
      rawRating: typeof previous?.rawRating === 'number' ? previous.rawRating : null,
      cannotJudge: previous?.cannotJudge === true,
      cannotJudgeComment: typeof previous?.cannotJudgeComment === 'string'
        ? previous.cannotJudgeComment
        : '',
      answeredAt: Number(previous?.completedAt) || null,
    } satisfies RowState];
  }));
}

export default function TopicAlignmentTrial({
  parameters, setAnswer,
}: StimulusParams<ImageTrialParameters>) {
  const participantId = useStoreSelector((state) => state.participantId);
  const flatSequence = useFlatSequence();
  const currentStoredAnswer = useStoredAnswer()?.answer;
  const storedResponseSignature = JSON.stringify(currentStoredAnswer?.responses ?? {});
  const storedResponses = useMemo(
    () => (currentStoredAnswer?.responses ?? {}) as Record<string, StoredResponse>,
    // reVISit may recreate the answer object while its contents remain unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedResponseSignature],
  );
  const orderKey = `${participantId}:${parameters.imageSlug}:${parameters.questions.map((q) => q.trialId).join('|')}`;
  const orderCache = useRef<{ key: string; questions: Question[] } | null>(null);
  if (!orderCache.current || orderCache.current.key !== orderKey) {
    orderCache.current = {
      key: orderKey,
      questions: seededShuffle(parameters.questions, orderKey),
    };
  }
  const orderedQuestions = orderCache.current.questions;
  const [rows, setRows] = useState<Record<string, RowState>>(
    () => initialRows(orderedQuestions, storedResponses),
  );
  const [lensStyle, setLensStyle] = useState<CSSProperties | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lensActive = useRef(false);
  const [zoomEvents, setZoomEvents] = useState(Number(currentStoredAnswer?.zoomEvents ?? 0));
  const [spaceAdvanceEvents, setSpaceAdvanceEvents] = useState(
    Number(currentStoredAnswer?.spaceAdvanceEvents ?? 0),
  );
  const pageStartedAt = useRef(Date.now());
  const { goToNextStep } = useNextStep();

  useEffect(() => {
    setRows(initialRows(orderedQuestions, storedResponses));
    setZoomEvents(Number(currentStoredAnswer?.zoomEvents ?? 0));
    setSpaceAdvanceEvents(Number(currentStoredAnswer?.spaceAdvanceEvents ?? 0));
    setLensStyle(null);
    lensActive.current = false;
    pageStartedAt.current = Date.now();
    // Reset only when navigation changes the image. Object-valued reVISit props may
    // be recreated during validation updates even when their contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters.imageSlug]);

  const allAnswered = orderedQuestions.every((question) => {
    const row = rows[question.trialId];
    return row && (row.rawRating !== null || row.cannotJudge);
  });

  const imageOrder = useMemo(() => {
    const imageComponents = flatSequence.filter(
      (component): component is string => typeof component === 'string' && component.startsWith('image--'),
    );
    return imageComponents.indexOf(`image--${parameters.imageSlug}`) + 1;
  }, [flatSequence, parameters.imageSlug]);
  const {
    imageSlug, filename, featureFlags,
  } = parameters;
  const attentionCheckEnabled = featureFlags.enableAttentionChecks;

  useEffect(() => {
    const now = Date.now();
    const prolificPid = new URLSearchParams(window.location.search).get('PROLIFIC_PID') ?? '';
    const prolificStudyId = new URLSearchParams(window.location.search).get('STUDY_ID') ?? '';
    const prolificSessionId = new URLSearchParams(window.location.search).get('SESSION_ID') ?? '';
    const responses = Object.fromEntries(orderedQuestions.map((question, index) => {
      const row = rows[question.trialId];
      const previous = storedResponses[question.trialId];
      const changedFromStored = Boolean(previous) && (
        previous.rawRating !== row.rawRating
        || previous.cannotJudge !== row.cannotJudge
        || previous.cannotJudgeComment !== row.cannotJudgeComment
      );
      const revisionCount = Number(previous?.revisionCount ?? 0) + (changedFromStored ? 1 : 0);
      const rawRating = row.cannotJudge ? null : row.rawRating;
      const completedAt = row.answeredAt;
      const responseTimeMs = changedFromStored || previous?.responseTimeMs === undefined
        ? completedAt ? completedAt - pageStartedAt.current : null
        : previous.responseTimeMs;
      return [question.trialId, {
        participantId,
        prolificPid,
        prolificStudyId,
        prolificSessionId,
        studyVersion: question.studyVersion,
        trialId: question.trialId,
        filename: question.filename,
        imageUrl: question.imageUrl,
        visType: question.visType,
        normalizedVC: question.normalizedVC,
        llmExtraTopic: question.llmExtraTopic,
        questionText: question.questionText,
        questionMode: question.questionMode,
        questionDirection: question.questionDirection,
        selectedLlmEvidence: question.selectedLlmEvidence,
        imageOrder,
        questionOrder: index + 1,
        rawRating,
        alignedRating: rawRating === null
          ? null
          : question.questionDirection === 'reducing' ? 8 - rawRating : rawRating,
        cannotJudge: row.cannotJudge,
        cannotJudgeComment: row.cannotJudge ? row.cannotJudgeComment.trim() : '',
        responseTimeMs,
        revisionCount,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        startedAt: previous?.startedAt ?? pageStartedAt.current,
        completedAt,
        zoomEvents,
        spaceAdvanceEvents,
        attentionCheckEnabled,
      }];
    }));
    setAnswer({
      status: allAnswered,
      answers: {
        imageSlug,
        filename,
        imageOrder,
        zoomEvents,
        spaceAdvanceEvents,
        responses,
        pageCompletedAt: allAnswered ? now : null,
      },
    });
  }, [
    allAnswered, attentionCheckEnabled, filename, imageOrder, imageSlug, orderedQuestions,
    participantId, rows, setAnswer, spaceAdvanceEvents, storedResponses, zoomEvents,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditing = target.matches(
        'textarea, select, button, input:not([type="radio"]):not([type="checkbox"]), [contenteditable="true"]',
      );
      if (event.code === 'Space' && !isEditing && allAnswered) {
        event.preventDefault();
        setSpaceAdvanceEvents((value) => value + 1);
        goToNextStep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allAnswered, goToNextStep]);

  const selectRating = (trialId: string, rating: number) => {
    setRows((current) => ({
      ...current,
      [trialId]: {
        ...current[trialId],
        rawRating: rating,
        cannotJudge: false,
        cannotJudgeComment: '',
        answeredAt: Date.now(),
      },
    }));
  };

  const selectCannotJudge = (trialId: string) => {
    setRows((current) => ({
      ...current,
      [trialId]: {
        ...current[trialId],
        rawRating: null,
        cannotJudge: true,
        answeredAt: Date.now(),
      },
    }));
  };

  const imageSrc = `${import.meta.env.BASE_URL}${parameters.imageUrl}`;
  const updateLens = (event: ReactMouseEvent<HTMLDivElement>) => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !featureFlags.enableImageZoom) return;

    const imageBox = image.getBoundingClientRect();
    const naturalAspect = image.naturalWidth / image.naturalHeight;
    const boxAspect = imageBox.width / imageBox.height;
    const renderedWidth = naturalAspect > boxAspect
      ? imageBox.width : imageBox.height * naturalAspect;
    const renderedHeight = naturalAspect > boxAspect
      ? imageBox.width / naturalAspect : imageBox.height;
    const renderedLeft = imageBox.left + (imageBox.width - renderedWidth) / 2;
    const renderedTop = imageBox.top + (imageBox.height - renderedHeight) / 2;
    const imageX = event.clientX - renderedLeft;
    const imageY = event.clientY - renderedTop;

    if (imageX < 0 || imageY < 0 || imageX > renderedWidth || imageY > renderedHeight) {
      setLensStyle(null);
      lensActive.current = false;
      return;
    }

    if (!lensActive.current) {
      lensActive.current = true;
      setZoomEvents((value) => value + 1);
    }

    const frameBox = event.currentTarget.getBoundingClientRect();
    const lensSize = Math.min(190, Math.max(140, frameBox.width * 0.15));
    const magnification = 2.25;
    setLensStyle({
      left: event.clientX - frameBox.left - lensSize / 2,
      top: event.clientY - frameBox.top - lensSize / 2,
      width: lensSize,
      height: lensSize,
      backgroundImage: `url("${imageSrc}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${renderedWidth * magnification}px ${renderedHeight * magnification}px`,
      backgroundPosition: `${lensSize / 2 - imageX * magnification}px ${lensSize / 2 - imageY * magnification}px`,
    });
  };

  return (
    <main
      className="alignmentTrial"
      data-image-slug={parameters.imageSlug}
      aria-labelledby="matrix-heading"
    >
      <p className="alignmentTrial__eyebrow">
        Please evaluate each statement below based on this visualization
      </p>
      <div
        className="alignmentTrial__imageFrame"
        onMouseMove={updateLens}
        onMouseLeave={() => {
          setLensStyle(null);
          lensActive.current = false;
        }}
      >
        <img
          ref={imageRef}
          className="alignmentTrial__image"
          src={imageSrc}
          alt={`Visualization stimulus ${parameters.filename}`}
        />
        {lensStyle && (
          <span
            className="alignmentTrial__lens"
            style={lensStyle}
            aria-hidden="true"
          />
        )}
      </div>

      <section className="alignmentTrial__matrixSection">
        <div className="alignmentTrial__question">
          <span id="matrix-heading">
            For each statement, select one response. Use Cannot judge only when the image
            does not provide enough information.
          </span>
        </div>
        <div className="alignmentTrial__tableWrap">
          <table className="alignmentTrial__matrix">
            <thead>
              <tr>
                <th scope="col">Statement</th>
                {SCALE_LABELS.map((label) => <th scope="col" key={label}>{label}</th>)}
                <th scope="col">Cannot judge</th>
              </tr>
            </thead>
            <tbody>
              {orderedQuestions.map((question) => {
                const row = rows[question.trialId];
                return (
                  <Fragment key={question.trialId}>
                    <tr className="alignmentTrial__responseGroup">
                      <th scope="row">{question.questionText}</th>
                      {SCALE_LABELS.map((label, index) => {
                        const value = index + 1;
                        return (
                          <td key={label}>
                            <label>
                              <input
                                type="radio"
                                name={`rating-${question.trialId}`}
                                value={value}
                                aria-label={`${question.questionText}: ${label}`}
                                checked={row.rawRating === value && !row.cannotJudge}
                                onChange={() => selectRating(question.trialId, value)}
                              />
                              <span className="srOnly">{label}</span>
                            </label>
                          </td>
                        );
                      })}
                      <td>
                        <label>
                          <input
                            type="radio"
                            name={`rating-${question.trialId}`}
                            aria-label={`${question.questionText}: I cannot judge this statement from the image`}
                            checked={row.cannotJudge}
                            onChange={() => selectCannotJudge(question.trialId)}
                          />
                          <span className="srOnly">Cannot judge</span>
                        </label>
                      </td>
                    </tr>
                    {row.cannotJudge && (
                      <tr>
                        <td className="alignmentTrial__commentCell" colSpan={9}>
                          <label>
                            <span>Optional: tell us why</span>
                            <textarea
                              aria-label={`Optional reason for: ${question.questionText}`}
                              value={row.cannotJudgeComment}
                              onChange={(event) => {
                                const cannotJudgeComment = event.currentTarget.value;
                                setRows((current) => ({
                                  ...current,
                                  [question.trialId]: {
                                    ...current[question.trialId],
                                    cannotJudgeComment,
                                  },
                                }));
                              }}
                              maxLength={500}
                              rows={2}
                              placeholder="For example: the text is too small to read"
                            />
                          </label>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="alignmentTrial__hint">
        Move the pointer over the image to magnify the area beneath it. After answering
        every row, press Space or use Next to continue.
      </p>
    </main>
  );
}
