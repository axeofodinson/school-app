import type { AssessmentStatus } from '@school/core';

import type { BadgeTone } from '../../ui';

/** Status colour + the word on the badge (never colour alone). */
export const STATUS_TONE: Record<AssessmentStatus, BadgeTone> = {
  draft: 'neutral',
  published: 'correct',
  closed: 'accent',
};
