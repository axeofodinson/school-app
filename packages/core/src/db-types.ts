// GENERATED: do not edit by hand.
// Source: local DB harness (TEST_PLAN DB-1) in the dev order: db/setup.sql +
// db/002–016 + 024–026 (production 2026-11-25) + 018 (cut-over, dev) + 028
// (attendance) + 029 (messaging) + 030 (question audio) + 017 + 023 (prompt 20:
// curriculum, question bank versions, learner state, access tiers) + 031
// (prompt 21: importer batches, math_svgs, import RPCs) + 032 (prompt 22: review
// queue RPCs) + 033 (prompt 30: lesson review) + 019 (prompt 40: mastery,
// follow-ups, diagnostics) + 034 (prompt 41: gate relax/restore,
// stuck students) + 020 (prompt 50: live exams, draw pool) + 035 (prompt 51: exam results). Draft 022 excluded. Via
//   npx supabase@3.3.0 gen types typescript --db-url <harness> --schema public
// Regenerate after each migration Hassan runs (see packages/core/README.md).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          ends_on: string | null;
          id: string;
          is_current: boolean;
          label: string;
          starts_on: string | null;
        };
        ComputedFields: never;
        Insert: {
          ends_on?: string | null;
          id?: string;
          is_current?: boolean;
          label: string;
          starts_on?: string | null;
        };
        Update: {
          ends_on?: string | null;
          id?: string;
          is_current?: boolean;
          label?: string;
          starts_on?: string | null;
        };
        Relationships: [];
      };
      account_links: {
        Row: {
          created_at: string;
          id: string;
          linked_by: string | null;
          moved: NonNullable<Json>;
          prep_profile_id: string;
          reason: string;
          school_profile_id: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          linked_by?: string | null;
          moved?: NonNullable<Json>;
          prep_profile_id: string;
          reason: string;
          school_profile_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          linked_by?: string | null;
          moved?: NonNullable<Json>;
          prep_profile_id?: string;
          reason?: string;
          school_profile_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'account_links_linked_by_fkey';
            columns: ['linked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_links_prep_profile_id_fkey';
            columns: ['prep_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_links_school_profile_id_fkey';
            columns: ['school_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_links_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };
      assessment_questions: {
        Row: {
          assessment_id: string;
          marks: number;
          question_id: string;
          question_version: number | null;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          marks?: number;
          question_id: string;
          question_version?: number | null;
          sort_order?: number;
        };
        Update: {
          assessment_id?: string;
          marks?: number;
          question_id?: string;
          question_version?: number | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'assessment_questions_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessment_questions_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      assessments: {
        Row: {
          blueprint: Json | null;
          class_id: string;
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          duration_seconds: number | null;
          file_mime: string | null;
          file_name: string | null;
          file_path: string | null;
          id: string;
          join_code: string | null;
          mode: string;
          opens_at: string | null;
          project_id: string | null;
          results_confirmed_at: string | null;
          results_confirmed_by: string | null;
          scheduled_on: string | null;
          settings: NonNullable<Json>;
          status: string;
          subject_id: string;
          title: string;
          total_marks: number | null;
          type: string;
          weightage: number;
          year_id: string;
        };
        ComputedFields: never;
        Insert: {
          blueprint?: Json | null;
          class_id: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          join_code?: string | null;
          mode?: string;
          opens_at?: string | null;
          project_id?: string | null;
          results_confirmed_at?: string | null;
          results_confirmed_by?: string | null;
          scheduled_on?: string | null;
          settings?: NonNullable<Json>;
          status?: string;
          subject_id: string;
          title: string;
          total_marks?: number | null;
          type?: string;
          weightage?: number;
          year_id: string;
        };
        Update: {
          blueprint?: Json | null;
          class_id?: string;
          closes_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          join_code?: string | null;
          mode?: string;
          opens_at?: string | null;
          project_id?: string | null;
          results_confirmed_at?: string | null;
          results_confirmed_by?: string | null;
          scheduled_on?: string | null;
          settings?: NonNullable<Json>;
          status?: string;
          subject_id?: string;
          title?: string;
          total_marks?: number | null;
          type?: string;
          weightage?: number;
          year_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assessments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_results_confirmed_by_fkey';
            columns: ['results_confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_year_id_fkey';
            columns: ['year_id'];
            isOneToOne: false;
            referencedRelation: 'academic_years';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance: {
        Row: {
          edit_count: number;
          enrollment_id: string;
          id: string;
          last_edited_at: string | null;
          marked_at: string | null;
          marked_by: string | null;
          on_date: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          edit_count?: number;
          enrollment_id: string;
          id?: string;
          last_edited_at?: string | null;
          marked_at?: string | null;
          marked_by?: string | null;
          on_date?: string;
          status?: string;
        };
        Update: {
          edit_count?: number;
          enrollment_id?: string;
          id?: string;
          last_edited_at?: string | null;
          marked_at?: string | null;
          marked_by?: string | null;
          on_date?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_enrollment_id_fkey';
            columns: ['enrollment_id'];
            isOneToOne: false;
            referencedRelation: 'enrollments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_marked_by_fkey';
            columns: ['marked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance_edits: {
        Row: {
          attendance_id: string;
          edited_at: string;
          edited_by: string | null;
          id: string;
          new_status: string;
          prev_status: string;
          reason: string;
        };
        ComputedFields: never;
        Insert: {
          attendance_id: string;
          edited_at?: string;
          edited_by?: string | null;
          id?: string;
          new_status: string;
          prev_status: string;
          reason: string;
        };
        Update: {
          attendance_id?: string;
          edited_at?: string;
          edited_by?: string | null;
          id?: string;
          new_status?: string;
          prev_status?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_edits_attendance_id_fkey';
            columns: ['attendance_id'];
            isOneToOne: false;
            referencedRelation: 'attendance';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_edits_edited_by_fkey';
            columns: ['edited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      chapters: {
        Row: {
          curriculum_id: string | null;
          id: string;
          sort_order: number;
          status: string;
          subject_id: string;
          textbook_ref: string | null;
          title: string;
          title_ur: string | null;
        };
        ComputedFields: never;
        Insert: {
          curriculum_id?: string | null;
          id?: string;
          sort_order?: number;
          status?: string;
          subject_id: string;
          textbook_ref?: string | null;
          title: string;
          title_ur?: string | null;
        };
        Update: {
          curriculum_id?: string | null;
          id?: string;
          sort_order?: number;
          status?: string;
          subject_id?: string;
          textbook_ref?: string | null;
          title?: string;
          title_ur?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chapters_curriculum_id_fkey';
            columns: ['curriculum_id'];
            isOneToOne: false;
            referencedRelation: 'curricula';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chapters_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
        ];
      };
      classes: {
        Row: {
          grade_level: number;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          grade_level: number;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          grade_level?: number;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      concept_mastery: {
        Row: {
          concept_id: string;
          evidence: NonNullable<Json>;
          last_attempt_at: string | null;
          learner_id: string;
          mastered_at: string | null;
          n_attempted: number;
          n_correct: number;
          n_distinct_q: number;
          next_review_at: string | null;
          review_stage: number;
          state: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          concept_id: string;
          evidence?: NonNullable<Json>;
          last_attempt_at?: string | null;
          learner_id: string;
          mastered_at?: string | null;
          n_attempted?: number;
          n_correct?: number;
          n_distinct_q?: number;
          next_review_at?: string | null;
          review_stage?: number;
          state?: string;
          updated_at?: string;
        };
        Update: {
          concept_id?: string;
          evidence?: NonNullable<Json>;
          last_attempt_at?: string | null;
          learner_id?: string;
          mastered_at?: string | null;
          n_attempted?: number;
          n_correct?: number;
          n_distinct_q?: number;
          next_review_at?: string | null;
          review_stage?: number;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concept_mastery_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concept_mastery_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      concept_prerequisites: {
        Row: {
          concept_id: string;
          requires_concept_id: string;
        };
        ComputedFields: never;
        Insert: {
          concept_id: string;
          requires_concept_id: string;
        };
        Update: {
          concept_id?: string;
          requires_concept_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concept_prerequisites_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concept_prerequisites_requires_concept_id_fkey';
            columns: ['requires_concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
        ];
      };
      concepts: {
        Row: {
          created_at: string;
          id: string;
          is_test_data: boolean;
          sort_order: number;
          status: string;
          summary_en: string | null;
          summary_ur: string | null;
          title_en: string;
          title_ur: string | null;
          topic_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_test_data?: boolean;
          sort_order?: number;
          status?: string;
          summary_en?: string | null;
          summary_ur?: string | null;
          title_en: string;
          title_ur?: string | null;
          topic_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_test_data?: boolean;
          sort_order?: number;
          status?: string;
          summary_en?: string | null;
          summary_ur?: string | null;
          title_en?: string;
          title_ur?: string | null;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concepts_topic_id_fkey';
            columns: ['topic_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id'];
          },
        ];
      };
      curricula: {
        Row: {
          board: string;
          code: string;
          created_at: string;
          effective_from: string | null;
          id: string;
          name: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          board: string;
          code: string;
          created_at?: string;
          effective_from?: string | null;
          id?: string;
          name: string;
          status?: string;
        };
        Update: {
          board?: string;
          code?: string;
          created_at?: string;
          effective_from?: string | null;
          id?: string;
          name?: string;
          status?: string;
        };
        Relationships: [];
      };
      debug_logs: {
        Row: {
          created_at: string;
          detail: string | null;
          event: string;
          id: number;
          student_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          detail?: string | null;
          event: string;
          id?: number;
          student_id?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          event?: string;
          id?: number;
          student_id?: string | null;
        };
        Relationships: [];
      };
      enrollments: {
        Row: {
          class_id: string;
          created_at: string;
          end_date: string | null;
          id: string;
          reason: string | null;
          roll_number: number | null;
          status: string;
          student_id: string;
          year_id: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          reason?: string | null;
          roll_number?: number | null;
          status?: string;
          student_id: string;
          year_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          reason?: string | null;
          roll_number?: number | null;
          status?: string;
          student_id?: string;
          year_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'enrollments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'enrollments_year_id_fkey';
            columns: ['year_id'];
            isOneToOne: false;
            referencedRelation: 'academic_years';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_events: {
        Row: {
          at: string;
          detail: Json | null;
          id: number;
          kind: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          detail?: Json | null;
          id?: never;
          kind: string;
          session_id: string;
        };
        Update: {
          at?: string;
          detail?: Json | null;
          id?: never;
          kind?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_events_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'exam_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_session_answers: {
        Row: {
          answer: Json | null;
          client_answered_at: string | null;
          is_correct: boolean | null;
          late: boolean;
          question_id: string;
          question_version: number;
          received_at: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          answer?: Json | null;
          client_answered_at?: string | null;
          is_correct?: boolean | null;
          late?: boolean;
          question_id: string;
          question_version: number;
          received_at?: string;
          session_id: string;
        };
        Update: {
          answer?: Json | null;
          client_answered_at?: string | null;
          is_correct?: boolean | null;
          late?: boolean;
          question_id?: string;
          question_version?: number;
          received_at?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_session_answers_question_id_question_version_fkey';
            columns: ['question_id', 'question_version'];
            isOneToOne: false;
            referencedRelation: 'question_versions';
            referencedColumns: ['question_id', 'version'];
          },
          {
            foreignKeyName: 'exam_session_answers_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'exam_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      exam_sessions: {
        Row: {
          assessment_id: string;
          client_elapsed_ms: number | null;
          created_at: string;
          deadline_at: string;
          delivery: string;
          enrollment_id: string;
          id: string;
          last_seen_at: string | null;
          learner_id: string;
          paper: NonNullable<Json>;
          score: number | null;
          started_at: string;
          status: string;
          submitted_at: string | null;
          total: number | null;
          void_reason: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          client_elapsed_ms?: number | null;
          created_at?: string;
          deadline_at: string;
          delivery?: string;
          enrollment_id: string;
          id?: string;
          last_seen_at?: string | null;
          learner_id: string;
          paper: NonNullable<Json>;
          score?: number | null;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          total?: number | null;
          void_reason?: string | null;
          voided_by?: string | null;
        };
        Update: {
          assessment_id?: string;
          client_elapsed_ms?: number | null;
          created_at?: string;
          deadline_at?: string;
          delivery?: string;
          enrollment_id?: string;
          id?: string;
          last_seen_at?: string | null;
          learner_id?: string;
          paper?: NonNullable<Json>;
          score?: number | null;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          total?: number | null;
          void_reason?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exam_sessions_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_sessions_enrollment_id_fkey';
            columns: ['enrollment_id'];
            isOneToOne: false;
            referencedRelation: 'enrollments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_sessions_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exam_sessions_voided_by_fkey';
            columns: ['voided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follow_ups: {
        Row: {
          assigned_by: string | null;
          close_reason: string | null;
          closed_at: string | null;
          concept_id: string;
          created_at: string;
          id: string;
          kind: string;
          learner_id: string;
          rounds: number;
          source_attempt_id: string | null;
          source_exam_session_id: string | null;
          status: string;
          subject_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_by?: string | null;
          close_reason?: string | null;
          closed_at?: string | null;
          concept_id: string;
          created_at?: string;
          id?: string;
          kind: string;
          learner_id: string;
          rounds?: number;
          source_attempt_id?: string | null;
          source_exam_session_id?: string | null;
          status?: string;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_by?: string | null;
          close_reason?: string | null;
          closed_at?: string | null;
          concept_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          learner_id?: string;
          rounds?: number;
          source_attempt_id?: string | null;
          source_exam_session_id?: string | null;
          status?: string;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follow_ups_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follow_ups_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follow_ups_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follow_ups_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
        ];
      };
      gate_overrides: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          follow_up_id: string | null;
          id: string;
          learner_id: string;
          reason: string;
          subject_id: string | null;
          topic_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          follow_up_id?: string | null;
          id?: string;
          learner_id: string;
          reason: string;
          subject_id?: string | null;
          topic_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          follow_up_id?: string | null;
          id?: string;
          learner_id?: string;
          reason?: string;
          subject_id?: string | null;
          topic_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'gate_overrides_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gate_overrides_follow_up_id_fkey';
            columns: ['follow_up_id'];
            isOneToOne: false;
            referencedRelation: 'follow_ups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gate_overrides_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gate_overrides_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gate_overrides_topic_id_fkey';
            columns: ['topic_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id'];
          },
        ];
      };
      import_batches: {
        Row: {
          chapter_id: string | null;
          created_at: string;
          file_name: string | null;
          id: string;
          imported_by: string;
          is_test_data: boolean;
          origin: string;
          question_count: number;
          report: Json | null;
          retire_note: string | null;
          retired_at: string | null;
          retired_by: string | null;
          source_note: string | null;
          status: string;
          topic_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          chapter_id?: string | null;
          created_at?: string;
          file_name?: string | null;
          id?: string;
          imported_by: string;
          is_test_data?: boolean;
          origin: string;
          question_count?: number;
          report?: Json | null;
          retire_note?: string | null;
          retired_at?: string | null;
          retired_by?: string | null;
          source_note?: string | null;
          status?: string;
          topic_id?: string | null;
        };
        Update: {
          chapter_id?: string | null;
          created_at?: string;
          file_name?: string | null;
          id?: string;
          imported_by?: string;
          is_test_data?: boolean;
          origin?: string;
          question_count?: number;
          report?: Json | null;
          retire_note?: string | null;
          retired_at?: string | null;
          retired_by?: string | null;
          source_note?: string | null;
          status?: string;
          topic_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_batches_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_batches_imported_by_fkey';
            columns: ['imported_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_batches_retired_by_fkey';
            columns: ['retired_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_batches_topic_id_fkey';
            columns: ['topic_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id'];
          },
        ];
      };
      item_approvals: {
        Row: {
          approved_at: string;
          approved_by: string;
          id: string;
          item_id: string;
          item_kind: string;
          note: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          scope: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string;
          approved_by: string;
          id?: string;
          item_id: string;
          item_kind: string;
          note?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope: string;
          version: number;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          id?: string;
          item_id?: string;
          item_kind?: string;
          note?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'item_approvals_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_approvals_revoked_by_fkey';
            columns: ['revoked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      item_reviews: {
        Row: {
          created_at: string;
          decision: string;
          id: string;
          item_id: string;
          item_kind: string;
          notes: string | null;
          reviewer_id: string;
          translation_ok: boolean | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decision: string;
          id?: string;
          item_id: string;
          item_kind: string;
          notes?: string | null;
          reviewer_id: string;
          translation_ok?: boolean | null;
          version: number;
        };
        Update: {
          created_at?: string;
          decision?: string;
          id?: string;
          item_id?: string;
          item_kind?: string;
          notes?: string | null;
          reviewer_id?: string;
          translation_ok?: boolean | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'item_reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      learning_content: {
        Row: {
          concept_id: string | null;
          created_at: string;
          created_by: string | null;
          current_version: number;
          id: string;
          import_batch_id: string | null;
          is_test_data: boolean;
          kind: string;
          origin: string;
          scope_class_id: string | null;
          status: string;
          topic_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          id?: string;
          import_batch_id?: string | null;
          is_test_data?: boolean;
          kind?: string;
          origin?: string;
          scope_class_id?: string | null;
          status?: string;
          topic_id: string;
          updated_at?: string;
        };
        Update: {
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          id?: string;
          import_batch_id?: string | null;
          is_test_data?: boolean;
          kind?: string;
          origin?: string;
          scope_class_id?: string | null;
          status?: string;
          topic_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_content_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_content_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_content_import_batch_id_fkey';
            columns: ['import_batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_content_scope_class_id_fkey';
            columns: ['scope_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_content_topic_id_fkey';
            columns: ['topic_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id'];
          },
        ];
      };
      learning_content_versions: {
        Row: {
          blocks: NonNullable<Json>;
          content_id: string;
          created_at: string;
          created_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          blocks: NonNullable<Json>;
          content_id: string;
          created_at?: string;
          created_by?: string | null;
          version: number;
        };
        Update: {
          blocks?: NonNullable<Json>;
          content_id?: string;
          created_at?: string;
          created_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_content_versions_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'learning_content';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_content_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      mastery_config: {
        Row: {
          diagnostic_default: number;
          diagnostic_max: number;
          diagnostic_min: number;
          first_review_days: number;
          hard_level: number;
          id: number;
          mastered_pct: number;
          need_fresh: number;
          need_hard: number;
          relief_rounds: number;
          round_min: number;
          updated_at: string;
          updated_by: string | null;
          weak_min: number;
          weak_pct: number;
          window_size: number;
        };
        ComputedFields: never;
        Insert: {
          diagnostic_default?: number;
          diagnostic_max?: number;
          diagnostic_min?: number;
          first_review_days?: number;
          hard_level?: number;
          id?: number;
          mastered_pct?: number;
          need_fresh?: number;
          need_hard?: number;
          relief_rounds?: number;
          round_min?: number;
          updated_at?: string;
          updated_by?: string | null;
          weak_min?: number;
          weak_pct?: number;
          window_size?: number;
        };
        Update: {
          diagnostic_default?: number;
          diagnostic_max?: number;
          diagnostic_min?: number;
          first_review_days?: number;
          hard_level?: number;
          id?: number;
          mastered_pct?: number;
          need_fresh?: number;
          need_hard?: number;
          relief_rounds?: number;
          round_min?: number;
          updated_at?: string;
          updated_by?: string | null;
          weak_min?: number;
          weak_pct?: number;
          window_size?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'mastery_config_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      math_svgs: {
        Row: {
          created_at: string;
          created_by: string | null;
          key: string;
          renderer: string;
          svg: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          key: string;
          renderer?: string;
          svg: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          key?: string;
          renderer?: string;
          svg?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'math_svgs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reads: {
        Row: {
          message_id: string;
          read_at: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          message_id: string;
          read_at?: string;
          student_id: string;
        };
        Update: {
          message_id?: string;
          read_at?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reads_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reads_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          push_claimed_at: string | null;
          push_result: Json | null;
          scope: string;
          sender_id: string | null;
          target_id: string | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          push_claimed_at?: string | null;
          push_result?: Json | null;
          scope: string;
          sender_id?: string | null;
          target_id?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          push_claimed_at?: string | null;
          push_result?: Json | null;
          scope?: string;
          sender_id?: string | null;
          target_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      practice_attempts: {
        Row: {
          device_id: string | null;
          finished_at: string | null;
          follow_up_id: string | null;
          id: string;
          is_test_data: boolean;
          items: NonNullable<Json>;
          kind: string;
          learner_id: string;
          n_correct: number;
          n_total: number;
          received_at: string;
          started_at: string;
          topic_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          device_id?: string | null;
          finished_at?: string | null;
          follow_up_id?: string | null;
          id: string;
          is_test_data?: boolean;
          items: NonNullable<Json>;
          kind: string;
          learner_id: string;
          n_correct?: number;
          n_total?: number;
          received_at?: string;
          started_at: string;
          topic_id?: string | null;
        };
        Update: {
          device_id?: string | null;
          finished_at?: string | null;
          follow_up_id?: string | null;
          id?: string;
          is_test_data?: boolean;
          items?: NonNullable<Json>;
          kind?: string;
          learner_id?: string;
          n_correct?: number;
          n_total?: number;
          received_at?: string;
          started_at?: string;
          topic_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_attempts_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'practice_attempts_topic_id_fkey';
            columns: ['topic_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          access_tier: string;
          created_at: string;
          full_name: string | null;
          id: string;
          is_test_data: boolean;
          merged_at: string | null;
          merged_into: string | null;
          phone: string | null;
          role: string;
          student_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          access_tier?: string;
          created_at?: string;
          full_name?: string | null;
          id: string;
          is_test_data?: boolean;
          merged_at?: string | null;
          merged_into?: string | null;
          phone?: string | null;
          role?: string;
          student_id?: string | null;
          updated_at?: string;
        };
        Update: {
          access_tier?: string;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_test_data?: boolean;
          merged_at?: string | null;
          merged_into?: string | null;
          phone?: string | null;
          role?: string;
          student_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_merged_into_fkey';
            columns: ['merged_into'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };
      project_concepts: {
        Row: {
          concept_id: string;
          project_id: string;
        };
        ComputedFields: never;
        Insert: {
          concept_id: string;
          project_id: string;
        };
        Update: {
          concept_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_concepts_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_concepts_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      project_rubric_criteria: {
        Row: {
          concept_id: string | null;
          id: string;
          levels: NonNullable<Json>;
          max_points: number;
          project_id: string;
          retired_at: string | null;
          sort_order: number;
          title_en: string;
          title_ur: string | null;
        };
        ComputedFields: never;
        Insert: {
          concept_id?: string | null;
          id?: string;
          levels?: NonNullable<Json>;
          max_points: number;
          project_id: string;
          retired_at?: string | null;
          sort_order?: number;
          title_en: string;
          title_ur?: string | null;
        };
        Update: {
          concept_id?: string | null;
          id?: string;
          levels?: NonNullable<Json>;
          max_points?: number;
          project_id?: string;
          retired_at?: string | null;
          sort_order?: number;
          title_en?: string;
          title_ur?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'project_rubric_criteria_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_rubric_criteria_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      project_scores: {
        Row: {
          assessment_id: string;
          criterion_id: string;
          enrollment_id: string;
          points: number;
          remark: string | null;
          scored_at: string;
          scored_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          criterion_id: string;
          enrollment_id: string;
          points: number;
          remark?: string | null;
          scored_at?: string;
          scored_by?: string | null;
        };
        Update: {
          assessment_id?: string;
          criterion_id?: string;
          enrollment_id?: string;
          points?: number;
          remark?: string | null;
          scored_at?: string;
          scored_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'project_scores_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_scores_criterion_id_fkey';
            columns: ['criterion_id'];
            isOneToOne: false;
            referencedRelation: 'project_rubric_criteria';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_scores_enrollment_id_fkey';
            columns: ['enrollment_id'];
            isOneToOne: false;
            referencedRelation: 'enrollments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_scores_scored_by_fkey';
            columns: ['scored_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      project_team_members: {
        Row: {
          assessment_id: string;
          enrollment_id: string;
          team_id: string;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          enrollment_id: string;
          team_id: string;
        };
        Update: {
          assessment_id?: string;
          enrollment_id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_team_members_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_team_members_enrollment_id_fkey';
            columns: ['enrollment_id'];
            isOneToOne: false;
            referencedRelation: 'enrollments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'project_teams';
            referencedColumns: ['id'];
          },
        ];
      };
      project_teams: {
        Row: {
          assessment_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          assessment_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_teams_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_teams_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          blocks: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          grade_max: number;
          grade_min: number;
          id: string;
          is_test_data: boolean;
          licence_note: string | null;
          materials: NonNullable<Json>;
          sdg_theme: number | null;
          source: string;
          status: string;
          subject_id: string | null;
          summary_en: string | null;
          summary_ur: string | null;
          team_size_max: number;
          title_en: string;
          title_ur: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocks?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          grade_max?: number;
          grade_min?: number;
          id?: string;
          is_test_data?: boolean;
          licence_note?: string | null;
          materials?: NonNullable<Json>;
          sdg_theme?: number | null;
          source?: string;
          status?: string;
          subject_id?: string | null;
          summary_en?: string | null;
          summary_ur?: string | null;
          team_size_max?: number;
          title_en: string;
          title_ur?: string | null;
          updated_at?: string;
        };
        Update: {
          blocks?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          grade_max?: number;
          grade_min?: number;
          id?: string;
          is_test_data?: boolean;
          licence_note?: string | null;
          materials?: NonNullable<Json>;
          sdg_theme?: number | null;
          source?: string;
          status?: string;
          subject_id?: string | null;
          summary_en?: string | null;
          summary_ur?: string | null;
          team_size_max?: number;
          title_en?: string;
          title_ur?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string;
          device_info: Json | null;
          disabled_at: string | null;
          id: string;
          student_id: string;
          token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          device_info?: Json | null;
          disabled_at?: string | null;
          id?: string;
          student_id: string;
          token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          device_info?: Json | null;
          disabled_at?: string | null;
          id?: string;
          student_id?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
        ];
      };
      question_versions: {
        Row: {
          answer: Json | null;
          body: NonNullable<Json>;
          cognitive_level: string;
          concept_id: string | null;
          created_at: string;
          created_by: string | null;
          difficulty: number;
          explanation: Json | null;
          question_id: string;
          type: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          answer?: Json | null;
          body: NonNullable<Json>;
          cognitive_level: string;
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          difficulty: number;
          explanation?: Json | null;
          question_id: string;
          type: string;
          version: number;
        };
        Update: {
          answer?: Json | null;
          body?: NonNullable<Json>;
          cognitive_level?: string;
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          difficulty?: number;
          explanation?: Json | null;
          question_id?: string;
          type?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'question_versions_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'question_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'question_versions_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'questions';
            referencedColumns: ['id'];
          },
        ];
      };
      questions: {
        Row: {
          answer: Json | null;
          body: NonNullable<Json>;
          chapter_id: string;
          cognitive_level: string;
          concept_id: string | null;
          created_at: string;
          created_by: string | null;
          current_version: number;
          default_marks: number;
          difficulty: number;
          explanation: Json | null;
          id: string;
          import_batch_id: string | null;
          is_test_data: boolean;
          language_complete: boolean;
          origin: string;
          scope_class_id: string | null;
          source: Json | null;
          status: string;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answer?: Json | null;
          body: NonNullable<Json>;
          chapter_id: string;
          cognitive_level?: string;
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          default_marks?: number;
          difficulty?: number;
          explanation?: Json | null;
          id?: string;
          import_batch_id?: string | null;
          is_test_data?: boolean;
          language_complete?: boolean;
          origin?: string;
          scope_class_id?: string | null;
          source?: Json | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          answer?: Json | null;
          body?: NonNullable<Json>;
          chapter_id?: string;
          cognitive_level?: string;
          concept_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          default_marks?: number;
          difficulty?: number;
          explanation?: Json | null;
          id?: string;
          import_batch_id?: string | null;
          is_test_data?: boolean;
          language_complete?: boolean;
          origin?: string;
          scope_class_id?: string | null;
          source?: Json | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'questions_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_import_batch_id_fkey';
            columns: ['import_batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'questions_scope_class_id_fkey';
            columns: ['scope_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      students: {
        Row: {
          admission_date: string;
          created_at: string;
          date_of_birth: string | null;
          full_name: string;
          guardian_name: string | null;
          guardian_phone: string | null;
          id: string;
          is_test_data: boolean;
          student_code: string;
        };
        ComputedFields: never;
        Insert: {
          admission_date?: string;
          created_at?: string;
          date_of_birth?: string | null;
          full_name: string;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          is_test_data?: boolean;
          student_code: string;
        };
        Update: {
          admission_date?: string;
          created_at?: string;
          date_of_birth?: string | null;
          full_name?: string;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          is_test_data?: boolean;
          student_code?: string;
        };
        Relationships: [];
      };
      subjects: {
        Row: {
          class_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          class_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subjects_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      submission_grade_edits: {
        Row: {
          edited_at: string;
          edited_by: string | null;
          id: string;
          new_score: number | null;
          prev_score: number | null;
          reason: string;
          submission_id: string;
        };
        ComputedFields: never;
        Insert: {
          edited_at?: string;
          edited_by?: string | null;
          id?: string;
          new_score?: number | null;
          prev_score?: number | null;
          reason: string;
          submission_id: string;
        };
        Update: {
          edited_at?: string;
          edited_by?: string | null;
          id?: string;
          new_score?: number | null;
          prev_score?: number | null;
          reason?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'submission_grade_edits_edited_by_fkey';
            columns: ['edited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'submission_grade_edits_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'submissions';
            referencedColumns: ['id'];
          },
        ];
      };
      submissions: {
        Row: {
          assessment_id: string;
          edit_count: number;
          enrollment_id: string;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          last_edited_at: string | null;
          responses: Json | null;
          score: number | null;
          submitted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          edit_count?: number;
          enrollment_id: string;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          last_edited_at?: string | null;
          responses?: Json | null;
          score?: number | null;
          submitted_at?: string | null;
        };
        Update: {
          assessment_id?: string;
          edit_count?: number;
          enrollment_id?: string;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          last_edited_at?: string | null;
          responses?: Json | null;
          score?: number | null;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'submissions_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'submissions_enrollment_id_fkey';
            columns: ['enrollment_id'];
            isOneToOne: false;
            referencedRelation: 'enrollments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'submissions_graded_by_fkey';
            columns: ['graded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      teacher_assignments: {
        Row: {
          class_id: string;
          id: string;
          subject_id: string | null;
          teacher_id: string;
          year_id: string;
        };
        ComputedFields: never;
        Insert: {
          class_id: string;
          id?: string;
          subject_id?: string | null;
          teacher_id: string;
          year_id: string;
        };
        Update: {
          class_id?: string;
          id?: string;
          subject_id?: string | null;
          teacher_id?: string;
          year_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_assignments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_assignments_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_assignments_teacher_id_fkey';
            columns: ['teacher_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_assignments_year_id_fkey';
            columns: ['year_id'];
            isOneToOne: false;
            referencedRelation: 'academic_years';
            referencedColumns: ['id'];
          },
        ];
      };
      topics: {
        Row: {
          chapter_id: string;
          created_at: string;
          diagnostic_size: number | null;
          id: string;
          is_test_data: boolean;
          sort_order: number;
          status: string;
          title_en: string;
          title_ur: string | null;
        };
        ComputedFields: never;
        Insert: {
          chapter_id: string;
          created_at?: string;
          diagnostic_size?: number | null;
          id?: string;
          is_test_data?: boolean;
          sort_order?: number;
          status?: string;
          title_en: string;
          title_ur?: string | null;
        };
        Update: {
          chapter_id?: string;
          created_at?: string;
          diagnostic_size?: number | null;
          id?: string;
          is_test_data?: boolean;
          sort_order?: number;
          status?: string;
          title_en?: string;
          title_ur?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'topics_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      answer_text_norm: { Args: { p: string }; Returns: string };
      attendance_day_summary: {
        Args: { p_on_date: string; p_year_id: string };
        Returns: {
          absent: number;
          class_id: string;
          class_name: string;
          enrolled: number;
          grade_level: number;
          late: number;
          marked: number;
          on_leave: number;
          present: number;
        }[];
      };
      attendance_student_summary: {
        Args: { p_class_id: string; p_from: string; p_to: string; p_year_id: string };
        Returns: {
          absent: number;
          enrollment_id: string;
          late: number;
          on_leave: number;
          present: number;
        }[];
      };
      auto_mark_item: { Args: { p_answer: Json; p_type: string; p_value: Json }; Returns: boolean };
      can_override_follow_up: { Args: { p_learner: string; p_subject: string }; Returns: boolean };
      can_review_question: { Args: { p_concept: string }; Returns: boolean };
      can_run_exam: { Args: { p_assessment: string }; Returns: boolean };
      class_follow_ups: { Args: { p_class: string }; Returns: Json };
      dearmor: { Args: { '': string }; Returns: string };
      dev_hard_delete_student: { Args: { p_student_id: string }; Returns: Json };
      diagnostic_items: { Args: { p_size?: number; p_topic: string }; Returns: Json };
      diagnostic_pick: { Args: { p_n: number; p_pool: Json }; Returns: Json };
      disable_push_token: { Args: { p_token: string }; Returns: undefined };
      exam_close_if_expired: { Args: { p_session: string }; Returns: boolean };
      exam_confirm: { Args: { p_assessment: string; p_reason?: string }; Returns: Json };
      exam_draw_pool: {
        Args: { p_class: string; p_subject: string };
        Returns: {
          chapter_id: string;
          difficulty: number;
          id: string;
          last_used_at: string;
          topic_id: string;
          type: string;
          version: number;
        }[];
      };
      exam_end: { Args: { p_assessment: string }; Returns: Json };
      exam_item_analysis: { Args: { p_assessment: string }; Returns: Json };
      exam_join: { Args: { p_code: string }; Returns: Json };
      exam_launch: { Args: { p_assessment: string; p_minutes?: number }; Returns: Json };
      exam_live: { Args: { p_assessment: string }; Returns: Json };
      exam_new_join_code: { Args: Record<PropertyKey, never>; Returns: string };
      exam_sweep: { Args: Record<PropertyKey, never>; Returns: number };
      exam_void_session: { Args: { p_reason: string; p_session: string }; Returns: Json };
      find_prep_accounts: {
        Args: { p_query: string };
        Returns: {
          attempts: number;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          merged_into: string;
        }[];
      };
      fresh_items_left: { Args: { p_concept: string; p_learner: string }; Returns: number };
      gate_relax: { Args: { p_follow_up: string; p_reason: string }; Returns: Json };
      gate_restore: { Args: { p_follow_up: string; p_reason: string }; Returns: Json };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { '': string }; Returns: string };
      grade_exam_session: { Args: { p_session: string }; Returns: undefined };
      import_content: { Args: { p_chunk: Json }; Returns: Json };
      import_find_matches: {
        Args: { p_subject: string; p_texts: string[] };
        Returns: {
          body: Json;
          idx: number;
          question_id: string;
          similarity: number;
          status: string;
        }[];
      };
      is_approved: { Args: { iid: string; kind: string; sc: string }; Returns: boolean };
      is_dev: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_oauth_provider: { Args: { p: string }; Returns: boolean };
      is_prep_provider: { Args: { p: string }; Returns: boolean };
      is_school_member: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_teacher: { Args: Record<PropertyKey, never>; Returns: boolean };
      link_prep_account: {
        Args: { p_prep_profile: string; p_reason: string; p_student_id: string };
        Returns: Json;
      };
      log_exam_event: {
        Args: { p_detail?: Json; p_kind: string; p_session: string };
        Returns: undefined;
      };
      mark_messages_read: { Args: { p_ids: string[] }; Returns: number };
      mastery_apply_attempt: { Args: { p_attempt: string }; Returns: Json };
      mastery_cfg: { Args: Record<PropertyKey, never>; Returns: Json };
      mastery_eval: { Args: { p_cfg: Json; p_events: Json; p_prev?: string }; Returns: Json };
      mastery_events: {
        Args: { p_concepts: string[]; p_learner: string };
        Returns: {
          concept_id: string;
          events: Json;
          last_at: string;
        }[];
      };
      message_read_counts: {
        Args: { p_ids: string[] };
        Returns: {
          message_id: string;
          read_count: number;
        }[];
      };
      my_live_exams: { Args: Record<PropertyKey, never>; Returns: Json };
      my_role: { Args: Record<PropertyKey, never>; Returns: string };
      my_student_id: { Args: Record<PropertyKey, never>; Returns: string };
      pgp_armor_headers: { Args: { '': string }; Returns: Record<string, unknown>[] };
      provision_student_login: { Args: { p_pin: string; p_student_id: string }; Returns: string };
      question_match_text: { Args: { body: Json }; Returns: string };
      recompute_all_mastery: { Args: { p_learner: string }; Returns: Json };
      recompute_mastery: { Args: { p_concepts: string[]; p_learner: string }; Returns: Json };
      record_attendance: {
        Args: {
          p_class_id: string;
          p_marks: Json;
          p_on_date: string;
          p_reason?: string;
          p_taken_at?: string;
        };
        Returns: Json;
      };
      record_grade: {
        Args: {
          p_assessment_id: string;
          p_enrollment_id: string;
          p_reason: string;
          p_score: number;
        };
        Returns: {
          assessment_id: string;
          edit_count: number;
          enrollment_id: string;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          last_edited_at: string | null;
          responses: Json | null;
          score: number | null;
          submitted_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'submissions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_practice_attempt: { Args: { p_attempt: Json }; Returns: Json };
      register_push_token: { Args: { p_device_info?: Json; p_token: string }; Returns: undefined };
      relieve_follow_up: { Args: { p_id: string; p_why: string }; Returns: undefined };
      retire_import_batch: { Args: { p_batch: string; p_note: string }; Returns: Json };
      review_approve_many: {
        Args: { p_items: Json; p_scopes: string[]; p_translation_ok?: boolean };
        Returns: Json;
      };
      review_counts: {
        Args: { p_batch?: string; p_chapter?: string; p_subject: string; p_topic?: string };
        Returns: Json;
      };
      review_edit_question: {
        Args: { p_patch: Json; p_question: string; p_version: number };
        Returns: Json;
      };
      review_lesson: {
        Args: {
          p_content: string;
          p_decision: string;
          p_notes?: string;
          p_translation_ok?: boolean;
          p_version: number;
        };
        Returns: Json;
      };
      review_question: {
        Args: {
          p_decision: string;
          p_notes?: string;
          p_question: string;
          p_scopes?: string[];
          p_translation_ok?: boolean;
          p_version: number;
        };
        Returns: Json;
      };
      review_queue: {
        Args: {
          p_batch?: string;
          p_chapter?: string;
          p_limit?: number;
          p_status?: string;
          p_subject: string;
          p_topic?: string;
        };
        Returns: {
          answer: Json;
          body: Json;
          can_review: boolean;
          chapter_id: string;
          cognitive_level: string;
          concept_id: string;
          created_at: string;
          difficulty: number;
          explanation: Json;
          id: string;
          import_batch_id: string;
          in_use: boolean;
          last_decision: string;
          last_notes: string;
          last_reviewed_at: string;
          last_translation: boolean;
          origin: string;
          scopes: string[];
          source: Json;
          status: string;
          topic_id: string;
          type: string;
          version: number;
        }[];
      };
      save_exam_answer: {
        Args: { p_answer: Json; p_client_at?: string; p_question: string; p_session: string };
        Returns: Json;
      };
      score_project: {
        Args: {
          p_assessment: string;
          p_enrollment: string;
          p_reason?: string;
          p_remark?: string;
          p_scores: Json;
          p_whole_team?: boolean;
        };
        Returns: number;
      };
      start_exam_session: { Args: { p_assessment: string }; Returns: Json };
      student_login_email: { Args: { p_student_code: string }; Returns: string };
      student_login_handle: { Args: { p_student_id: string }; Returns: string };
      student_paper: {
        Args: { p_assessment_id: string };
        Returns: {
          body: Json;
          cognitive_level: string;
          marks: number;
          question_id: string;
          sort_order: number;
          type: string;
        }[];
      };
      student_paper_levels: {
        Args: { p_assessment_ids: string[] };
        Returns: {
          assessment_id: string;
          cognitive_level: string;
          marks: number;
        }[];
      };
      submit_exam_session: { Args: { p_session: string }; Returns: Json };
      sync_student_login_access: { Args: { p_student_id: string }; Returns: undefined };
      teaches_chapter: { Args: { cid: string }; Returns: boolean };
      teaches_chapter_subject: { Args: { cid: string }; Returns: boolean };
      teaches_class: { Args: { cid: string }; Returns: boolean };
      teaches_class_subject_now: { Args: { p_class: string; p_subject: string }; Returns: boolean };
      teaches_concept: { Args: { cid: string }; Returns: boolean };
      teaches_learner: { Args: { lid: string }; Returns: boolean };
      teaches_topic: { Args: { tid: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
