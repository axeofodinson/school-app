// GENERATED: do not edit by hand.
// Source: local DB harness (TEST_PLAN DB-1) with db/setup.sql + db/002–016 (024,
// applied 2026-11-24, adds only a trigger: no type change) (the
// migrations applied in production; drafts 017/022 excluded), via
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
      assessment_questions: {
        Row: {
          assessment_id: string;
          marks: number;
          question_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          marks?: number;
          question_id: string;
          sort_order?: number;
        };
        Update: {
          assessment_id?: string;
          marks?: number;
          question_id?: string;
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
          class_id: string;
          created_at: string;
          created_by: string | null;
          file_mime: string | null;
          file_name: string | null;
          file_path: string | null;
          id: string;
          scheduled_on: string | null;
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
          class_id: string;
          created_at?: string;
          created_by?: string | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          scheduled_on?: string | null;
          status?: string;
          subject_id: string;
          title: string;
          total_marks?: number | null;
          type?: string;
          weightage?: number;
          year_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          created_by?: string | null;
          file_mime?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          scheduled_on?: string | null;
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
          enrollment_id: string;
          id: string;
          marked_by: string | null;
          on_date: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          enrollment_id: string;
          id?: string;
          marked_by?: string | null;
          on_date?: string;
          status?: string;
        };
        Update: {
          enrollment_id?: string;
          id?: string;
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
      chapters: {
        Row: {
          id: string;
          sort_order: number;
          subject_id: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          sort_order?: number;
          subject_id: string;
          title: string;
        };
        Update: {
          id?: string;
          sort_order?: number;
          subject_id?: string;
          title?: string;
        };
        Relationships: [
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
      messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
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
          scope: string;
          sender_id?: string | null;
          target_id?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
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
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: string;
          student_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role?: string;
          student_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: string;
          student_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
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
      questions: {
        Row: {
          answer: Json | null;
          body: NonNullable<Json>;
          chapter_id: string;
          cognitive_level: string;
          created_at: string;
          created_by: string | null;
          default_marks: number;
          id: string;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answer?: Json | null;
          body: NonNullable<Json>;
          chapter_id: string;
          cognitive_level?: string;
          created_at?: string;
          created_by?: string | null;
          default_marks?: number;
          id?: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          answer?: Json | null;
          body?: NonNullable<Json>;
          chapter_id?: string;
          cognitive_level?: string;
          created_at?: string;
          created_by?: string | null;
          default_marks?: number;
          id?: string;
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
            foreignKeyName: 'questions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      dearmor: { Args: { '': string }; Returns: string };
      dev_hard_delete_student: { Args: { p_student_id: string }; Returns: Json };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { '': string }; Returns: string };
      is_dev: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_teacher: { Args: Record<PropertyKey, never>; Returns: boolean };
      my_role: { Args: Record<PropertyKey, never>; Returns: string };
      my_student_id: { Args: Record<PropertyKey, never>; Returns: string };
      pgp_armor_headers: { Args: { '': string }; Returns: Record<string, unknown>[] };
      provision_student_login: { Args: { p_pin: string; p_student_id: string }; Returns: string };
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
      student_login_email: { Args: { p_student_code: string }; Returns: string };
      student_login_handle: { Args: { p_student_id: string }; Returns: string };
      sync_student_login_access: { Args: { p_student_id: string }; Returns: undefined };
      teaches_chapter: { Args: { cid: string }; Returns: boolean };
      teaches_class: { Args: { cid: string }; Returns: boolean };
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
