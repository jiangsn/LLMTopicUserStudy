import { useEffect, useState } from 'react';
import type { StimulusParams } from '../../store/types';
import { useStoredAnswer } from '../../store/hooks/useStoredAnswer';
import './EndFeedback.css';

const EXPERIENCE_LABELS = [
  'Very poor',
  'Poor',
  'Somewhat poor',
  'Neither poor nor good',
  'Somewhat good',
  'Good',
  'Excellent',
];

export default function EndFeedback({
  setAnswer,
}: StimulusParams<Record<string, never>>) {
  const stored = useStoredAnswer()?.answer;
  const [rating, setRating] = useState<number | null>(
    typeof stored?.overallExperienceRating === 'number'
      ? stored.overallExperienceRating
      : null,
  );
  const [comments, setComments] = useState(
    typeof stored?.overallComments === 'string' ? stored.overallComments : '',
  );

  useEffect(() => {
    setAnswer({
      status: rating !== null,
      answers: {
        overallExperienceRating: rating,
        overallComments: comments.trim(),
      },
    });
  }, [comments, rating, setAnswer]);

  return (
    <main className="endFeedback">
      <h1>Before you finish</h1>
      <p>Thank you for completing all visualization questions. Please tell us about your overall experience.</p>

      <fieldset>
        <legend>
          Overall, how would you rate your experience completing this study?
          {' '}
          <strong>*</strong>
        </legend>
        <div className="endFeedback__scale">
          {EXPERIENCE_LABELS.map((label, index) => {
            const value = index + 1;
            return (
              <label key={label}>
                <input
                  type="radio"
                  name="overall-experience"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="endFeedback__comments">
        <span>Do you have any comments or suggestions for the researchers? (Optional)</span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.currentTarget.value)}
          rows={5}
          maxLength={2000}
        />
      </label>
    </main>
  );
}
