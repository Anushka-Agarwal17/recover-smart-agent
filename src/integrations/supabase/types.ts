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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_decisions: {
        Row: {
          case_id: string
          confidence: number
          created_at: string
          diagnosis: string
          id: string
          next_attempt_at: string | null
          reason: string
          recommended_action: string
          recovery_probability: number
          risk_level: string
          source: string
          stop_reason: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          confidence: number
          created_at?: string
          diagnosis: string
          id?: string
          next_attempt_at?: string | null
          reason: string
          recommended_action: string
          recovery_probability: number
          risk_level: string
          source?: string
          stop_reason?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          confidence?: number
          created_at?: string
          diagnosis?: string
          id?: string
          next_attempt_at?: string | null
          reason?: string
          recommended_action?: string
          recovery_probability?: number
          risk_level?: string
          source?: string
          stop_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string | null
          actor: string
          case_id: string | null
          created_at: string
          customer_id: string | null
          event_type: string
          id: string
          reason: string | null
          result: string | null
          transaction_ref: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          actor?: string
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_type: string
          id?: string
          reason?: string | null
          result?: string | null
          transaction_ref?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          actor?: string
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          event_type?: string
          id?: string
          reason?: string | null
          result?: string | null
          transaction_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string
          external_id: string
          id: string
          lifetime_value: number
          name: string
          opted_out: boolean
          previous_failure_count: number
          previous_success_count: number
          risk_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          external_id: string
          id?: string
          lifetime_value?: number
          name: string
          opted_out?: boolean
          previous_failure_count?: number
          previous_success_count?: number
          risk_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          external_id?: string
          id?: string
          lifetime_value?: number
          name?: string
          opted_out?: boolean
          previous_failure_count?: number
          previous_success_count?: number
          risk_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_settings: {
        Row: {
          created_at: string
          escalation_threshold_amount: number
          max_interventions: number
          max_retries: number
          min_recovery_probability: number
          recovery_window_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          escalation_threshold_amount?: number
          max_interventions?: number
          max_retries?: number
          min_recovery_probability?: number
          recovery_window_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          escalation_threshold_amount?: number
          max_interventions?: number
          max_retries?: number
          min_recovery_probability?: number
          recovery_window_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          merchant_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          merchant_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_attempts: {
        Row: {
          action: string
          amount: number
          case_id: string
          created_at: string
          decision_id: string | null
          id: string
          outcome: string
          reason: string | null
          recovered_amount: number
          user_id: string
        }
        Insert: {
          action: string
          amount?: number
          case_id: string
          created_at?: string
          decision_id?: string | null
          id?: string
          outcome: string
          reason?: string | null
          recovered_amount?: number
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          case_id?: string
          created_at?: string
          decision_id?: string | null
          id?: string
          outcome?: string
          reason?: string | null
          recovered_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_attempts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_attempts_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "ai_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_cases: {
        Row: {
          alt_method_count: number
          amount_at_risk: number
          created_at: string
          customer_id: string
          id: string
          priority_score: number
          recommended_action: string | null
          recovered_amount: number
          recovered_at: string | null
          recovery_probability: number
          reengagement_count: number
          reminder_count: number
          retry_count: number
          risk_level: string
          status: string
          stop_reason: string | null
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_method_count?: number
          amount_at_risk: number
          created_at?: string
          customer_id: string
          id?: string
          priority_score?: number
          recommended_action?: string | null
          recovered_amount?: number
          recovered_at?: string | null
          recovery_probability?: number
          reengagement_count?: number
          reminder_count?: number
          retry_count?: number
          risk_level?: string
          status?: string
          stop_reason?: string | null
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_method_count?: number
          amount_at_risk?: number
          created_at?: string
          customer_id?: string
          id?: string
          priority_score?: number
          recommended_action?: string | null
          recovered_amount?: number
          recovered_at?: string | null
          recovery_probability?: number
          reengagement_count?: number
          reminder_count?: number
          retry_count?: number
          risk_level?: string
          status?: string
          stop_reason?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_cases_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          checkout_status: string | null
          created_at: string
          currency: string
          customer_id: string
          failure_reason: string | null
          id: string
          occurred_at: string
          payment_method: string
          recovery_probability: number
          recovery_status: string
          retry_count: number
          status: string
          subscription_status: string | null
          transaction_ref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          checkout_status?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          failure_reason?: string | null
          id?: string
          occurred_at: string
          payment_method: string
          recovery_probability?: number
          recovery_status?: string
          retry_count?: number
          status: string
          subscription_status?: string | null
          transaction_ref: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_status?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          failure_reason?: string | null
          id?: string
          occurred_at?: string
          payment_method?: string
          recovery_probability?: number
          recovery_status?: string
          retry_count?: number
          status?: string
          subscription_status?: string | null
          transaction_ref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
