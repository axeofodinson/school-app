// Access tiers (DECISIONS #23, db/023): what a signed-in account may use.
// School login (admission no + PIN, or staff email) = everything its role
// allows. Google sign-in = Preparation only. This is UI gating, a convenience:
// RLS (db/023 restrictive policies) is the security boundary.

export type AccessTier = 'school' | 'prep_only';

/** The tier stored on a profile. Missing or unknown counts as 'school' (pre-023 rows). */
export function tierOf(profile: { access_tier?: string | null } | null | undefined): AccessTier {
  return profile?.access_tier === 'prep_only' ? 'prep_only' : 'school';
}

export type Feature =
  | 'learn'
  | 'practice'
  | 'diagnose'
  | 'followUps'
  | 'revision'
  | 'exams'
  | 'assignments'
  | 'worksheets'
  | 'results'
  | 'attendance'
  | 'messages'
  | 'projects';

/** Preparation: open to every tier. */
export const PREPARATION_FEATURES = [
  'learn',
  'practice',
  'diagnose',
  'followUps',
  'revision',
] as const satisfies readonly Feature[];

/** Needs a school login (enrollment, teacher, class). Hidden for prep-only, with an explanation. */
export const SCHOOL_ONLY_FEATURES = [
  'exams',
  'assignments',
  'worksheets',
  'results',
  'attendance',
  'messages',
  'projects',
] as const satisfies readonly Feature[];

export function canUse(tier: AccessTier, feature: Feature): boolean {
  if (tier === 'school') return true;
  return (PREPARATION_FEATURES as readonly Feature[]).includes(feature);
}

/**
 * How the Prepare gate is relieved (LMS_AUDIT §3.5). Everyone gets automatic
 * relief (N failed rounds or an exhausted pool). Only school learners have a
 * teacher who can relax/restore a gate, and only they have exam follow-ups.
 */
export interface ReliefPolicy {
  autoRelief: true;
  teacherOverrides: boolean;
  examFollowUpsBlockPrepare: boolean;
  notifyTeacher: boolean;
}

export function reliefPolicyFor(tier: AccessTier): ReliefPolicy {
  return tier === 'school'
    ? {
        autoRelief: true,
        teacherOverrides: true,
        examFollowUpsBlockPrepare: true,
        notifyTeacher: true,
      }
    : {
        autoRelief: true,
        teacherOverrides: false,
        examFollowUpsBlockPrepare: false,
        notifyTeacher: false,
      };
}
