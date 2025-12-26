export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      email_generations: {
        Row: {
          body: string
          cliche_count: number | null
          created_at: string
          has_em_dash: boolean | null
          id: string
          input_json: Json
          latency_ms: number | null
          model_name: string
          prompt_version: string
          scenario_name: string | null
          session_id: string | null
          source: string
          subject: string | null
          user_id: string | null
          validator_errors: Json | null
          validator_passed: boolean | null
          word_count: number | null
        }
        Insert: {
          body: string
          cliche_count?: number | null
          created_at?: string
          has_em_dash?: boolean | null
          id?: string
          input_json: Json
          latency_ms?: number | null
          model_name: string
          prompt_version: string
          scenario_name?: string | null
          session_id?: string | null
          source?: string
          subject?: string | null
          user_id?: string | null
          validator_errors?: Json | null
          validator_passed?: boolean | null
          word_count?: number | null
        }
        Update: {
          body?: string
          cliche_count?: number | null
          created_at?: string
          has_em_dash?: boolean | null
          id?: string
          input_json?: Json
          latency_ms?: number | null
          model_name?: string
          prompt_version?: string
          scenario_name?: string | null
          session_id?: string | null
          source?: string
          subject?: string | null
          user_id?: string | null
          validator_errors?: Json | null
          validator_passed?: boolean | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_generations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "prolific_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      prolific_post_survey: {
        Row: {
          changes_before_sending: Json | null
          comparison_rating: number | null
          created_at: string
          id: string
          likelihood_change: string | null
          likelihood_reasons: Json | null
          most_useful_part: string | null
          session_id: string
          what_felt_off: string | null
          whats_missing: string | null
        }
        Insert: {
          changes_before_sending?: Json | null
          comparison_rating?: number | null
          created_at?: string
          id?: string
          likelihood_change?: string | null
          likelihood_reasons?: Json | null
          most_useful_part?: string | null
          session_id: string
          what_felt_off?: string | null
          whats_missing?: string | null
        }
        Update: {
          changes_before_sending?: Json | null
          comparison_rating?: number | null
          created_at?: string
          id?: string
          likelihood_change?: string | null
          likelihood_reasons?: Json | null
          most_useful_part?: string | null
          session_id?: string
          what_felt_off?: string | null
          whats_missing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prolific_post_survey_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "prolific_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      prolific_sessions: {
        Row: {
          cold_email_frequency: string
          completed_at: string | null
          created_at: string
          id: string
          profession: string
          prolific_id: string
          prolific_session_id: string | null
          study_id: string | null
        }
        Insert: {
          cold_email_frequency: string
          completed_at?: string | null
          created_at?: string
          id?: string
          profession: string
          prolific_id: string
          prolific_session_id?: string | null
          study_id?: string | null
        }
        Update: {
          cold_email_frequency?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          profession?: string
          prolific_id?: string
          prolific_session_id?: string | null
          study_id?: string | null
        }
        Relationships: []
      }
      prolific_step_tracking: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          prolific_id: string
          session_id: string | null
          step_name: string
          step_number: number
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          prolific_id: string
          session_id?: string | null
          step_name: string
          step_number: number
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          prolific_id?: string
          session_id?: string | null
          step_name?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prolific_step_tracking_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "prolific_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
