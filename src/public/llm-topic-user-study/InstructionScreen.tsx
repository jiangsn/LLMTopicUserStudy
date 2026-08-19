import { useEffect } from 'react';
import type { StimulusParams } from '../../store/types';
import './InstructionScreen.css';

type InstructionParameters = {
  enableImageZoom: boolean;
  enableAttentionChecks: boolean;
  allowPrevious: boolean;
};

const PREVIEW_SCALE = [
  'Strongly disagree',
  'Disagree',
  'Slightly disagree',
  'Neutral',
  'Slightly agree',
  'Agree',
  'Strongly agree',
];

export default function InstructionScreen({
  parameters, setAnswer,
}: StimulusParams<InstructionParameters>) {
  useEffect(() => {
    setAnswer({ status: true, answers: { instructionsViewed: true } });
  }, [setAnswer]);
  const imageSrc = `${import.meta.env.BASE_URL}llm-topic-user-study/assets/economist_daily_chart_75.png`;
  return (
    <main className="studyInstructions">
      <h1>How to complete the study</h1>
      <p>
        <strong>Visual complexity</strong>
        {' '}
        means the amount of detail or intricacy in a
        visualization and how it affects reading and understanding.
      </p>

      <div className="studyInstructions__figure" aria-label="Annotated example of the trial interface">
        <div className="studyInstructions__preview">
          <div className="instructionPreview__heading">Evaluate each statement based on this visualization</div>
          <div className="instructionPreview__image">
            <img src={imageSrc} alt="Example bar chart used only in the instructions" />
            <span
              className="instructionPreview__lens"
              style={{ backgroundImage: `url("${imageSrc}")` }}
              aria-hidden="true"
            />
          </div>
          <div className="instructionPreview__prompt">
            Select one response for every statement.
          </div>
          <div className="instructionPreview__matrix">
            <div className="instructionPreview__header">Statement</div>
            {PREVIEW_SCALE.map((label) => <div className="instructionPreview__header" key={label}>{label}</div>)}
            <div className="instructionPreview__header">Cannot judge</div>
            <div className="instructionPreview__statement">The visualization feels crowded or cluttered.</div>
            {PREVIEW_SCALE.map((label) => <span className="instructionPreview__radio" key={label} />)}
            <span className="instructionPreview__radio" />
            <div className="instructionPreview__statement">The labels and other text are difficult to read.</div>
            {PREVIEW_SCALE.map((label) => <span className="instructionPreview__radio" key={label} />)}
            <span className="instructionPreview__radio" />
          </div>
          <div className="instructionPreview__navigation">
            <span>Next</span>
          </div>
        </div>

        <div className="studyInstructions__callout studyInstructions__callout--one">
          1. Inspect the visualization. Move the pointer over it to magnify local details.
        </div>
        <div className="studyInstructions__callout studyInstructions__callout--two">
          2. Rate every statement. Use Cannot judge only when the image lacks enough information.
        </div>
        <div className="studyInstructions__callout studyInstructions__callout--three">
          3. Answer every row, then press Space or select Next.
        </div>

        <svg
          className="studyInstructions__annotations"
          viewBox="0 0 1366 768"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker id="instruction-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          <path className="callout__arrow" d="M282 125 L465 183" />
          <path className="callout__arrow" d="M282 390 L332 515" />
        </svg>
      </div>

      {parameters.allowPrevious && (
        <p className="studyInstructions__lead">
          <strong>Previous</strong>
          {' '}
          returns to the prior visualization and preserves its question order.
        </p>
      )}
    </main>
  );
}
