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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      call_logs: {
        Row: {
          contact_id: string
          created_at: string
          dialpad_call_id: string | null
          dialpad_summary: string | null
          dialpad_talk_time_seconds: number | null
          dialpad_total_duration_seconds: number | null
          dialpad_transcript: string | null
          follow_up_date: string | null
          id: string
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          transcript_synced_at: string | null
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          dialpad_call_id?: string | null
          dialpad_summary?: string | null
          dialpad_talk_time_seconds?: number | null
          dialpad_total_duration_seconds?: number | null
          dialpad_transcript?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          transcript_synced_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          dialpad_call_id?: string | null
          dialpad_summary?: string | null
          dialpad_talk_time_seconds?: number | null
          dialpad_total_duration_seconds?: number | null
          dialpad_transcript?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          transcript_synced_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          contact_id: string
          content: string
          created_at: string
          created_by: string
          dialpad_call_id: string | null
          id: string
          source: Database["public"]["Enums"]["contact_note_source"]
          updated_at: string
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string
          created_by: string
          dialpad_call_id?: string | null
          id?: string
          source: Database["public"]["Enums"]["contact_note_source"]
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string
          dialpad_call_id?: string | null
          id?: string
          source?: Database["public"]["Enums"]["contact_note_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          authority_level: string | null
          best_route_to_decision_maker: string | null
          best_time_to_call: string | null
          budget_indication: string | null
          business_name: string
          business_size: string | null
          buying_signal_strength: string | null
          call_attempt_count: number
          city: string | null
          contact_person: string | null
          created_at: string
          dm_email: string | null
          dm_linkedin: string | null
          dm_name: string | null
          dm_phone: string | null
          dm_phone_type: string | null
          dm_role: string | null
          email: string | null
          follow_up_note: string | null
          gatekeeper_name: string | null
          gatekeeper_notes: string | null
          gbp_rating: number | null
          ghl_contact_id: string | null
          gmb_link: string | null
          google_rating: number | null
          google_review_count: number | null
          has_facebook_ads: string | null
          has_google_ads: string | null
          id: string
          industry: string
          is_dnc: boolean
          last_call_sentiment: string | null
          last_called_at: string | null
          last_outcome: Database["public"]["Enums"]["call_outcome"] | null
          latest_appointment_outcome:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          latest_appointment_recorded_at: string | null
          latest_appointment_scheduled_for: string | null
          meeting_booked_date: string | null
          next_followup_date: string | null
          phone: string
          phone_e164: string | null
          phone_number_quality: Database["public"]["Enums"]["phone_number_quality"]
          phone_type: string | null
          prospect_tier: string | null
          review_count: number | null
          state: string | null
          status: string
          trade_type: string | null
          updated_at: string
          uploaded_by: string | null
          voicemail_count: number
          website: string | null
          work_type: string | null
        }
        Insert: {
          authority_level?: string | null
          best_route_to_decision_maker?: string | null
          best_time_to_call?: string | null
          budget_indication?: string | null
          business_name: string
          business_size?: string | null
          buying_signal_strength?: string | null
          call_attempt_count?: number
          city?: string | null
          contact_person?: string | null
          created_at?: string
          dm_email?: string | null
          dm_linkedin?: string | null
          dm_name?: string | null
          dm_phone?: string | null
          dm_phone_type?: string | null
          dm_role?: string | null
          email?: string | null
          follow_up_note?: string | null
          gatekeeper_name?: string | null
          gatekeeper_notes?: string | null
          gbp_rating?: number | null
          ghl_contact_id?: string | null
          gmb_link?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          has_facebook_ads?: string | null
          has_google_ads?: string | null
          id?: string
          industry: string
          is_dnc?: boolean
          last_call_sentiment?: string | null
          last_called_at?: string | null
          last_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          latest_appointment_outcome?:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          latest_appointment_recorded_at?: string | null
          latest_appointment_scheduled_for?: string | null
          meeting_booked_date?: string | null
          next_followup_date?: string | null
          phone: string
          phone_e164?: string | null
          phone_number_quality?: Database["public"]["Enums"]["phone_number_quality"]
          phone_type?: string | null
          prospect_tier?: string | null
          review_count?: number | null
          state?: string | null
          status?: string
          trade_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          voicemail_count?: number
          website?: string | null
          work_type?: string | null
        }
        Update: {
          authority_level?: string | null
          best_route_to_decision_maker?: string | null
          best_time_to_call?: string | null
          budget_indication?: string | null
          business_name?: string
          business_size?: string | null
          buying_signal_strength?: string | null
          call_attempt_count?: number
          city?: string | null
          contact_person?: string | null
          created_at?: string
          dm_email?: string | null
          dm_linkedin?: string | null
          dm_name?: string | null
          dm_phone?: string | null
          dm_phone_type?: string | null
          dm_role?: string | null
          email?: string | null
          follow_up_note?: string | null
          gatekeeper_name?: string | null
          gatekeeper_notes?: string | null
          gbp_rating?: number | null
          ghl_contact_id?: string | null
          gmb_link?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          has_facebook_ads?: string | null
          has_google_ads?: string | null
          id?: string
          industry?: string
          is_dnc?: boolean
          last_call_sentiment?: string | null
          last_called_at?: string | null
          last_outcome?: Database["public"]["Enums"]["call_outcome"] | null
          latest_appointment_outcome?:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          latest_appointment_recorded_at?: string | null
          latest_appointment_scheduled_for?: string | null
          meeting_booked_date?: string | null
          next_followup_date?: string | null
          phone?: string
          phone_e164?: string | null
          phone_number_quality?: Database["public"]["Enums"]["phone_number_quality"]
          phone_type?: string | null
          prospect_tier?: string | null
          review_count?: number | null
          state?: string | null
          status?: string
          trade_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
          voicemail_count?: number
          website?: string | null
          work_type?: string | null
        }
        Relationships: []
      }
      dialer_lead_locks: {
        Row: {
          contact_id: string
          created_at: string
          expires_at: string
          id: string
          industry: string | null
          session_id: string
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          expires_at: string
          id?: string
          industry?: string | null
          session_id: string
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          industry?: string | null
          session_id?: string
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialer_lead_locks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      dialpad_calls: {
        Row: {
          call_log_id: string | null
          call_state: string | null
          contact_id: string
          created_at: string
          dialpad_call_id: string
          id: string
          sync_error: string | null
          sync_status: string
          transcript_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          call_log_id?: string | null
          call_state?: string | null
          contact_id: string
          created_at?: string
          dialpad_call_id: string
          id?: string
          sync_error?: string | null
          sync_status?: string
          transcript_synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          call_log_id?: string | null
          call_state?: string | null
          contact_id?: string
          created_at?: string
          dialpad_call_id?: string
          id?: string
          sync_error?: string | null
          sync_status?: string
          transcript_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialpad_calls_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: true
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialpad_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      dialpad_settings: {
        Row: {
          created_at: string
          dialpad_phone_number: string | null
          dialpad_user_id: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dialpad_phone_number?: string | null
          dialpad_user_id: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dialpad_phone_number?: string | null
          dialpad_user_id?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_ghl_pushes: {
        Row: {
          ai_fields: Json | null
          ai_note: string | null
          attempt_count: number
          contact_id: string
          created_at: string
          dialpad_call_id: string
          id: string
          last_error: string | null
          next_retry_at: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_fields?: Json | null
          ai_note?: string | null
          attempt_count?: number
          contact_id: string
          created_at?: string
          dialpad_call_id: string
          id?: string
          last_error?: string | null
          next_retry_at?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_fields?: Json | null
          ai_note?: string | null
          attempt_count?: number
          contact_id?: string
          created_at?: string
          dialpad_call_id?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_ghl_pushes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_targets: {
        Row: {
          created_at: string
          id: string
          metric_key: string
          period_type: string
          scope_type: string
          target_value: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_key: string
          period_type: string
          scope_type: string
          target_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_key?: string
          period_type?: string
          scope_type?: string
          target_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pipeline_items: {
        Row: {
          appointment_outcome:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          assigned_user_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          created_by: string
          deal_value: number | null
          follow_up_method: string
          id: string
          notes: string
          outcome_notes: string
          outcome_recorded_at: string | null
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          reschedule_count: number
          scheduled_for: string | null
          source_call_log_id: string | null
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
        }
        Insert: {
          appointment_outcome?:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          assigned_user_id: string
          completed_at?: string | null
          contact_id: string
          created_at?: string
          created_by: string
          deal_value?: number | null
          follow_up_method?: string
          id?: string
          notes?: string
          outcome_notes?: string
          outcome_recorded_at?: string | null
          pipeline_type: Database["public"]["Enums"]["pipeline_type"]
          reschedule_count?: number
          scheduled_for?: string | null
          source_call_log_id?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Update: {
          appointment_outcome?:
            | Database["public"]["Enums"]["appointment_outcome"]
            | null
          assigned_user_id?: string
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string
          deal_value?: number | null
          follow_up_method?: string
          id?: string
          notes?: string
          outcome_notes?: string
          outcome_recorded_at?: string | null
          pipeline_type?: Database["public"]["Enums"]["pipeline_type"]
          reschedule_count?: number
          scheduled_for?: string | null
          source_call_log_id?: string | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_items_source_call_log_id_fkey"
            columns: ["source_call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_update_google_reviews: { Args: { updates: Json }; Returns: Json }
      claim_dialer_leads: {
        Args: {
          _business_size?: string
          _buying_signal_strength?: string
          _claim_size?: number
          _contact_owner?: string
          _has_dm_phone?: boolean
          _has_facebook_ads?: string
          _has_google_ads?: string
          _industries?: string[]
          _lock_minutes?: number
          _min_gbp_rating?: number
          _min_review_count?: number
          _phone_type?: string
          _prospect_tier?: string
          _session_id: string
          _states?: string[]
          _trade_types?: string[]
          _work_type?: string
        }
        Returns: Json
      }
      classify_au_phone_type: {
        Args: { phone_number: string }
        Returns: string
      }
      export_contacts_for_ghl_link: {
        Args: never
        Returns: {
          business_name: string
          contact_id: string
          outcome: string
          phone: string
          status: string
        }[]
      }
      export_contacts_for_linking: {
        Args: { p_limit?: number }
        Returns: {
          business_name: string
          ghl_contact_id: string
          id: string
          phone: string
          status: string
        }[]
      }
      get_dialer_queue_count: {
        Args: {
          _business_size?: string
          _buying_signal_strength?: string
          _contact_owner?: string
          _has_dm_phone?: boolean
          _has_facebook_ads?: string
          _has_google_ads?: string
          _industries?: string[]
          _min_gbp_rating?: number
          _min_review_count?: number
          _phone_type?: string
          _prospect_tier?: string
          _session_id: string
          _states?: string[]
          _trade_types?: string[]
          _work_type?: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_dialer_lead_locks: {
        Args: {
          _contact_ids?: string[]
          _lock_minutes?: number
          _session_id: string
        }
        Returns: number
      }
      release_dialer_lead_locks: {
        Args: { _contact_ids?: string[]; _session_id: string }
        Returns: number
      }
      set_ghl_contact_id: {
        Args: { p_contact_id: string; p_ghl_contact_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "sales_rep"
      appointment_outcome:
        | "no_show"
        | "rescheduled"
        | "showed_closed"
        | "showed_no_close"
        | "showed_verbal_commitment"
      call_outcome:
        | "no_answer"
        | "voicemail"
        | "not_interested"
        | "dnc"
        | "follow_up"
        | "booked"
        | "wrong_number"
      contact_note_source:
        | "manual"
        | "dialpad_summary"
        | "dialpad_transcript"
        | "ai_summary"
      phone_number_quality: "unconfirmed" | "confirmed" | "suspect" | "dead"
      pipeline_status: "open" | "completed" | "canceled"
      pipeline_type: "follow_up" | "booked"
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
    Enums: {
      app_role: ["admin", "sales_rep"],
      appointment_outcome: [
        "no_show",
        "rescheduled",
        "showed_closed",
        "showed_no_close",
        "showed_verbal_commitment",
      ],
      call_outcome: [
        "no_answer",
        "voicemail",
        "not_interested",
        "dnc",
        "follow_up",
        "booked",
        "wrong_number",
      ],
      contact_note_source: [
        "manual",
        "dialpad_summary",
        "dialpad_transcript",
        "ai_summary",
      ],
      phone_number_quality: ["unconfirmed", "confirmed", "suspect", "dead"],
      pipeline_status: ["open", "completed", "canceled"],
      pipeline_type: ["follow_up", "booked"],
    },
  },
} as const
