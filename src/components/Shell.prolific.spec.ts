import { describe, expect, test } from 'vitest';
import { getMissingProlificParams, REQUIRED_PROLIFIC_PARAMS } from '../utils/prolificParams';

describe('production Prolific entry parameters', () => {
  test('accepts the complete Prolific parameter set', () => {
    const params = new URLSearchParams({
      PROLIFIC_PID: 'participant-123',
      STUDY_ID: 'study-456',
      SESSION_ID: 'session-789',
    });

    expect(getMissingProlificParams(params)).toEqual([]);
  });

  test.each(REQUIRED_PROLIFIC_PARAMS)('blocks a missing or blank %s', (missingKey) => {
    const params = new URLSearchParams({
      PROLIFIC_PID: 'participant-123',
      STUDY_ID: 'study-456',
      SESSION_ID: 'session-789',
    });
    params.set(missingKey, '   ');

    expect(getMissingProlificParams(params)).toEqual([missingKey]);
  });
});
