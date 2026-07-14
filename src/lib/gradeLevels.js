// Grade-level display helpers. `classes.grade_level` is an integer that ORDERS
// the class list (db/setup.sql) — it is never shown to users as a raw number
// beyond an ordering hint. Some levels have a human name rather than a number:
// PG (Play Group) is the lowest level, standardised on grade level 0 (db/015).
//
// gradeLevelLabel maps a level to its user-facing string, going through i18n so
// it stays bilingual + RTL-correct (CLAUDE.md: no hardcoded user-facing text).
// Called at render time so a runtime language switch re-labels correctly.
import { t } from '../i18n';

// Levels that carry a name instead of a number, keyed by grade_level -> i18n key
// under console.classes.levels. Extend here (not in screens) if more named
// pre-primary levels are added later.
const NAMED_LEVELS = {
  0: 'console.classes.levels.pg',
};

// The label to show for a grade level: a named level's word (e.g. "PG"), else
// the numbered "Grade level N" string every other class already uses.
export function gradeLevelLabel(level) {
  const key = NAMED_LEVELS[level];
  if (key) return t(key);
  return t('console.classes.gradeLevel', { level });
}
