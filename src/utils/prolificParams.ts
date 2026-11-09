export const REQUIRED_PROLIFIC_PARAMS = ['PROLIFIC_PID', 'STUDY_ID', 'SESSION_ID'] as const;

export function getMissingProlificParams(searchParams: URLSearchParams) {
  return REQUIRED_PROLIFIC_PARAMS.filter((key) => !searchParams.get(key)?.trim());
}
