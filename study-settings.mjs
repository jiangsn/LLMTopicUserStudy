// Central extension switches. Change these values, run `yarn study:prepare`, and
// re-run the automated pilot checks before distributing a new study version.
export const FEATURE_FLAGS = Object.freeze({
  enableImageZoom: true,
  enableAttentionChecks: false,
  allowPrevious: true,
  questionMode: 'generic',
  storageEngine: 'localStorage',
});
