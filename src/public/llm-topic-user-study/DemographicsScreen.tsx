import { useEffect, useMemo, useState } from 'react';
import type { StimulusParams } from '../../store/types';
import { useStoredAnswer } from '../../store/hooks/useStoredAnswer';
import './DemographicsScreen.css';

type DemographicAnswers = {
  workerId: string;
  prolificStudyId: string;
  prolificSessionId: string;
  retake: '' | 'Yes' | 'No';
  gender: string;
  genderSelfDescription: string;
  ageCategory: string;
  education: string;
  complexVisualizationExperience: string;
};

const EMPTY_ANSWERS: DemographicAnswers = {
  workerId: '',
  prolificStudyId: '',
  prolificSessionId: '',
  retake: '',
  gender: '',
  genderSelfDescription: '',
  ageCategory: '',
  education: '',
  complexVisualizationExperience: '',
};

const GENDERS = [
  'Man',
  'Woman',
  'Non-binary',
  'Prefer not to disclose',
  'Prefer to self-describe',
];

const AGES = ['18-25', '26-35', '36-45', '46-55', 'Over 55'];
const EDUCATION = [
  'Some high-school',
  'College',
  'Graduate school',
  'Professional school',
  'PhD',
];

export default function DemographicsScreen({
  setAnswer,
}: StimulusParams<Record<string, never>>) {
  const stored = useStoredAnswer()?.answer as Partial<DemographicAnswers> | undefined;
  const prolificPid = useMemo(
    () => new URLSearchParams(window.location.search).get('PROLIFIC_PID') ?? '',
    [],
  );
  const prolificStudyId = useMemo(
    () => new URLSearchParams(window.location.search).get('STUDY_ID') ?? '',
    [],
  );
  const prolificSessionId = useMemo(
    () => new URLSearchParams(window.location.search).get('SESSION_ID') ?? '',
    [],
  );
  const [values, setValues] = useState<DemographicAnswers>(() => ({
    ...EMPTY_ANSWERS,
    ...stored,
    workerId: stored?.workerId ?? prolificPid,
    prolificStudyId: stored?.prolificStudyId ?? prolificStudyId,
    prolificSessionId: stored?.prolificSessionId ?? prolificSessionId,
  }));

  const selfDescriptionRequired = values.gender === 'Prefer to self-describe';
  const complete = Boolean(
    values.retake
      && values.gender
      && (!selfDescriptionRequired || values.genderSelfDescription.trim())
      && values.ageCategory
      && values.education
      && values.complexVisualizationExperience.trim(),
  );

  useEffect(() => {
    setAnswer({
      status: complete,
      answers: {
        ...values,
        genderSelfDescription: selfDescriptionRequired
          ? values.genderSelfDescription.trim()
          : '',
      },
    });
  }, [complete, selfDescriptionRequired, setAnswer, values]);

  const setField = <K extends keyof DemographicAnswers>(
    field: K,
    value: DemographicAnswers[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <main className="demographics">
      <h1>Demographics information</h1>
      <p>
        Please tell us a little about yourself. Fields marked with
        {' '}
        <strong>*</strong>
        {' '}
        are required.
      </p>

      <label className="demographics__field">
        <span>Please provide your worker ID if you come from a crowdsourcing platform:</span>
        <input
          type="text"
          value={values.workerId}
          onChange={(event) => setField('workerId', event.currentTarget.value)}
          autoComplete="off"
        />
      </label>

      <label className="demographics__field demographics__compact">
        <span>
          <strong>*</strong>
          {' '}
          Have you taken this test before?
        </span>
        <select
          aria-label="Have you taken this test before?"
          value={values.retake}
          onChange={(event) => setField('retake', event.currentTarget.value as 'Yes' | 'No')}
        >
          <option value="">Select one</option>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </label>

      <fieldset className="demographics__fieldset">
        <legend>
          <strong>*</strong>
          {' '}
          What is your gender?
        </legend>
        <div className="demographics__choices">
          {GENDERS.map((gender) => (
            <label key={gender}>
              <input
                type="radio"
                name="gender"
                value={gender}
                checked={values.gender === gender}
                onChange={() => setField('gender', gender)}
              />
              <span>{gender}</span>
            </label>
          ))}
          <input
            aria-label="Please self-describe your gender"
            className="demographics__selfDescribe"
            type="text"
            value={values.genderSelfDescription}
            disabled={!selfDescriptionRequired}
            required={selfDescriptionRequired}
            onChange={(event) => setField('genderSelfDescription', event.currentTarget.value)}
          />
        </div>
      </fieldset>

      <label className="demographics__field demographics__compact">
        <span>
          <strong>*</strong>
          {' '}
          How old are you?
        </span>
        <select
          aria-label="How old are you?"
          value={values.ageCategory}
          onChange={(event) => setField('ageCategory', event.currentTarget.value)}
        >
          <option value="">Select one</option>
          {AGES.map((age) => <option key={age} value={age}>{age}</option>)}
        </select>
      </label>

      <label className="demographics__field demographics__compact">
        <span>
          <strong>*</strong>
          {' '}
          What is the highest level of education you have received?
        </span>
        <select
          aria-label="What is the highest level of education you have received?"
          value={values.education}
          onChange={(event) => setField('education', event.currentTarget.value)}
        >
          <option value="">Select one</option>
          {EDUCATION.map((education) => (
            <option key={education} value={education}>{education}</option>
          ))}
        </select>
      </label>

      <label className="demographics__field">
        <span>
          <strong>*</strong>
          {' '}
          Describe the most complex visualization you have ever seen. What did it look like?
          A link to the image would be helpful, but it is not absolutely necessary.
        </span>
        <textarea
          value={values.complexVisualizationExperience}
          onChange={(event) => setField(
            'complexVisualizationExperience',
            event.currentTarget.value,
          )}
          rows={4}
          maxLength={2000}
        />
      </label>
    </main>
  );
}
