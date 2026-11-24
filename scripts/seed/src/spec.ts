// The dataset's shape. Counts follow TEST_PLAN.md §Seed / LMS_AUDIT.md §Seed.
export const SPEC = {
  students: 656,
  teachers: 30,
  /** PG then Class 1 … Class 10, two sections each (≈ 30 per section). */
  grades: [
    { key: 'pg', base: 'PG', level: 0 },
    ...Array.from({ length: 10 }, (_, i) => ({
      key: String(i + 1),
      base: `Class ${i + 1}`,
      level: i + 1,
    })),
  ],
  sections: ['A', 'B'],
  /** LMS part (needs 017): the pilot class and three subjects. */
  lms: {
    gradeKey: '9',
    subjects: ['Mathematics', 'Physics', 'Chemistry'],
    chaptersPerSubject: 6,
    topicsPerChapter: 4,
    conceptsPerTopic: 4,
    questionsPerTopic: 90,
    historyDays: 90,
    attemptsPerLearner: 36,
    pastExamsPerSection: 10,
    questionsPerExam: 20,
  },
} as const;

/** Subjects per grade (PTB-style, placeholders; content is data, not code). */
export function subjectsForLevel(level: number): string[] {
  if (level === 0) return ['Early Numeracy', 'Early Literacy', 'Urdu'];
  if (level <= 5) return ['English', 'Urdu', 'Mathematics', 'General Science', 'Islamiyat'];
  if (level <= 8)
    return ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiyat', 'Social Studies', 'Computer'];
  return [
    'English',
    'Urdu',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Islamiyat',
    'Pakistan Studies',
    'Computer Science',
  ];
}

/** Teacher specialities: how many of the 30 teachers teach each subject. */
export const TEACHER_POOLS: Record<string, number> = {
  English: 4,
  Urdu: 4,
  Mathematics: 4,
  'General Science': 2,
  Science: 2,
  Physics: 1,
  Chemistry: 1,
  Biology: 1,
  Islamiyat: 3,
  'Social Studies': 1,
  'Pakistan Studies': 1,
  Computer: 1,
  'Computer Science': 1,
  'Early Years': 4,
};
export const EARLY_YEARS_SUBJECTS = new Set(['Early Numeracy', 'Early Literacy']);
