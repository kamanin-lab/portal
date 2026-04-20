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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_jobs: {
        Row: {
          audit_fetched: boolean
          clickup_comment_id: string | null
          clickup_task_id: string
          clickup_task_name: string | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          hitl_action: string | null
          hitl_at: string | null
          hitl_comment: string | null
          hitl_credits: number | null
          hitl_hours: number | null
          id: string
          input: Json
          job_type: string
          model_used: string | null
          output: Json | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audit_fetched?: boolean
          clickup_comment_id?: string | null
          clickup_task_id: string
          clickup_task_name?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          hitl_action?: string | null
          hitl_at?: string | null
          hitl_comment?: string | null
          hitl_credits?: number | null
          hitl_hours?: number | null
          id?: string
          input?: Json
          job_type?: string
          model_used?: string | null
          output?: Json | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audit_fetched?: boolean
          clickup_comment_id?: string | null
          clickup_task_id?: string
          clickup_task_name?: string | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          hitl_action?: string | null
          hitl_at?: string | null
          hitl_comment?: string | null
          hitl_credits?: number | null
          hitl_hours?: number | null
          id?: string
          input?: Json
          job_type?: string
          model_used?: string | null
          output?: Json | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_config: {
        Row: {
          clickup_cf_option_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          narrative: string
          next_narrative: string
          project_config_id: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          clickup_cf_option_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          narrative?: string
          next_narrative?: string
          project_config_id: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          clickup_cf_option_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          narrative?: string
          next_narrative?: string
          project_config_id?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_config_project_config_id_fkey"
            columns: ["project_config_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      client_file_activity: {
        Row: {
          actor_label: string | null
          created_at: string | null
          event_type: string
          id: string
          name: string
          nextcloud_activity_id: number | null
          path: string | null
          profile_id: string
          source: string
        }
        Insert: {
          actor_label?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          name: string
          nextcloud_activity_id?: number | null
          path?: string | null
          profile_id: string
          source?: string
        }
        Update: {
          actor_label?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          name?: string
          nextcloud_activity_id?: number | null
          path?: string | null
          profile_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_file_activity_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workspaces: {
        Row: {
          created_at: string | null
          display_name: string
          icon: string
          id: string
          is_active: boolean
          module_key: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          display_name: string
          icon?: string
          id?: string
          is_active?: boolean
          module_key: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          display_name?: string
          icon?: string
          id?: string
          is_active?: boolean
          module_key?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_cache: {
        Row: {
          attachments: Json | null
          author_avatar: string | null
          author_email: string | null
          author_id: number
          author_name: string
          clickup_comment_id: string
          clickup_created_at: string
          comment_text: string
          created_at: string | null
          display_text: string | null
          id: string
          is_from_portal: boolean | null
          last_synced: string | null
          profile_id: string
          task_id: string
        }
        Insert: {
          attachments?: Json | null
          author_avatar?: string | null
          author_email?: string | null
          author_id: number
          author_name: string
          clickup_comment_id: string
          clickup_created_at: string
          comment_text: string
          created_at?: string | null
          display_text?: string | null
          id?: string
          is_from_portal?: boolean | null
          last_synced?: string | null
          profile_id: string
          task_id: string
        }
        Update: {
          attachments?: Json | null
          author_avatar?: string | null
          author_email?: string | null
          author_id?: number
          author_name?: string
          clickup_comment_id?: string
          clickup_created_at?: string
          comment_text?: string
          created_at?: string | null
          display_text?: string | null
          id?: string
          is_from_portal?: boolean | null
          last_synced?: string | null
          profile_id?: string
          task_id?: string
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          created_at: string
          credits_per_month: number
          id: string
          is_active: boolean
          organization_id: string
          package_name: string
          started_at: string
        }
        Insert: {
          created_at?: string
          credits_per_month: number
          id?: string
          is_active?: boolean
          organization_id: string
          package_name: string
          started_at?: string
        }
        Update: {
          created_at?: string
          credits_per_month?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          package_name?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          organization_id: string
          profile_id: string
          task_id: string | null
          task_name: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          profile_id: string
          task_id?: string | null
          task_name?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          task_id?: string | null
          task_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          clickup_task_id: string | null
          comment_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          profile_id: string
          project_config_id: string | null
          task_id: string | null
          title: string
          type: string
        }
        Insert: {
          archived_at?: string | null
          clickup_task_id?: string | null
          comment_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          profile_id: string
          project_config_id?: string | null
          task_id?: string | null
          title: string
          type: string
        }
        Update: {
          archived_at?: string | null
          clickup_task_id?: string | null
          comment_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          profile_id?: string
          project_config_id?: string | null
          task_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_config_id_fkey"
            columns: ["project_config_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          departments: string[] | null
          id: string
          invited_email: string | null
          last_invite_sent_at: string | null
          organization_id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string
          departments?: string[] | null
          id?: string
          invited_email?: string | null
          last_invite_sent_at?: string | null
          organization_id: string
          profile_id: string
          role: string
        }
        Update: {
          created_at?: string
          departments?: string[] | null
          id?: string
          invited_email?: string | null
          last_invite_sent_at?: string | null
          organization_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          clickup_chat_channel_id: string | null
          clickup_department_field_id: string | null
          clickup_list_ids: Json
          created_at: string
          departments_cache: Json | null
          id: string
          name: string
          nextcloud_client_root: string | null
          slug: string
          support_task_id: string | null
          updated_at: string
        }
        Insert: {
          clickup_chat_channel_id?: string | null
          clickup_department_field_id?: string | null
          clickup_list_ids?: Json
          created_at?: string
          departments_cache?: Json | null
          id?: string
          name: string
          nextcloud_client_root?: string | null
          slug: string
          support_task_id?: string | null
          updated_at?: string
        }
        Update: {
          clickup_chat_channel_id?: string | null
          clickup_department_field_id?: string | null
          clickup_list_ids?: Json
          created_at?: string
          departments_cache?: Json | null
          id?: string
          name?: string
          nextcloud_client_root?: string | null
          slug?: string
          support_task_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string | null
          email: string
          email_notifications: boolean | null
          full_name: string | null
          id: string
          last_project_reminder_sent_at: string | null
          last_recommendation_reminder_sent_at: string | null
          last_reminder_sent_at: string | null
          last_unread_digest_sent_at: string | null
          last_weekly_summary_sent_at: string | null
          notification_preferences: Json | null
          organization_id: string | null
          updated_at: string | null
          wp_mcp_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email: string
          email_notifications?: boolean | null
          full_name?: string | null
          id: string
          last_project_reminder_sent_at?: string | null
          last_recommendation_reminder_sent_at?: string | null
          last_reminder_sent_at?: string | null
          last_unread_digest_sent_at?: string | null
          last_weekly_summary_sent_at?: string | null
          notification_preferences?: Json | null
          organization_id?: string | null
          updated_at?: string | null
          wp_mcp_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string
          email_notifications?: boolean | null
          full_name?: string | null
          id?: string
          last_project_reminder_sent_at?: string | null
          last_recommendation_reminder_sent_at?: string | null
          last_reminder_sent_at?: string | null
          last_unread_digest_sent_at?: string | null
          last_weekly_summary_sent_at?: string | null
          notification_preferences?: Json | null
          organization_id?: string | null
          updated_at?: string | null
          wp_mcp_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_access: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          project_config_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          project_config_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          project_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_access_project_config_id_fkey"
            columns: ["project_config_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      project_config: {
        Row: {
          clickup_list_id: string
          clickup_phase_field_id: string | null
          client_initials: string
          client_name: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          nextcloud_root_path: string | null
          start_date: string | null
          target_date: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          clickup_list_id: string
          clickup_phase_field_id?: string | null
          client_initials?: string
          client_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          nextcloud_root_path?: string | null
          start_date?: string | null
          target_date?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          clickup_list_id?: string
          clickup_phase_field_id?: string | null
          client_initials?: string
          client_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nextcloud_root_path?: string | null
          start_date?: string | null
          target_date?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_file_activity: {
        Row: {
          actor_label: string | null
          created_at: string | null
          event_type: string
          id: string
          name: string
          nextcloud_activity_id: number | null
          path: string | null
          profile_id: string
          project_config_id: string
          source: string
        }
        Insert: {
          actor_label?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          name: string
          nextcloud_activity_id?: number | null
          path?: string | null
          profile_id: string
          project_config_id: string
          source?: string
        }
        Update: {
          actor_label?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          name?: string
          nextcloud_activity_id?: number | null
          path?: string | null
          profile_id?: string
          project_config_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_file_activity_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory_entries: {
        Row: {
          body: string
          category: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          project_id: string | null
          reviewed_at: string | null
          scope: string
          source_ref: string | null
          source_type: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        Insert: {
          body: string
          category: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
          reviewed_at?: string | null
          scope: string
          source_ref?: string | null
          source_type?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          body?: string
          category?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
          reviewed_at?: string | null
          scope?: string
          source_ref?: string | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quick_actions: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_enabled: boolean
          key: string
          label: string
          project_config_id: string
          sort_order: number
          subtitle: string
          url: string | null
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_enabled?: boolean
          key: string
          label: string
          project_config_id: string
          sort_order?: number
          subtitle?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_enabled?: boolean
          key?: string
          label?: string
          project_config_id?: string
          sort_order?: number
          subtitle?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quick_actions_project_config_id_fkey"
            columns: ["project_config_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_cache: {
        Row: {
          assignees: Json | null
          attachments: Json | null
          chapter_config_id: string | null
          clickup_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_visible: boolean
          last_activity_at: string | null
          last_synced: string | null
          name: string
          project_config_id: string
          raw_data: Json | null
          status: string
          status_color: string | null
        }
        Insert: {
          assignees?: Json | null
          attachments?: Json | null
          chapter_config_id?: string | null
          clickup_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_visible?: boolean
          last_activity_at?: string | null
          last_synced?: string | null
          name: string
          project_config_id: string
          raw_data?: Json | null
          status: string
          status_color?: string | null
        }
        Update: {
          assignees?: Json | null
          attachments?: Json | null
          chapter_config_id?: string | null
          clickup_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_visible?: boolean
          last_activity_at?: string | null
          last_synced?: string | null
          name?: string
          project_config_id?: string
          raw_data?: Json | null
          status?: string
          status_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_task_cache_chapter_config_id_fkey"
            columns: ["chapter_config_id"]
            isOneToOne: false
            referencedRelation: "chapter_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_cache_project_config_id_fkey"
            columns: ["project_config_id"]
            isOneToOne: false
            referencedRelation: "project_config"
            referencedColumns: ["id"]
          },
        ]
      }
      read_receipts: {
        Row: {
          context_type: string
          created_at: string
          id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          context_type: string
          created_at?: string
          id?: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          context_type?: string
          created_at?: string
          id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "read_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      step_enrichment: {
        Row: {
          clickup_task_id: string
          created_at: string | null
          id: string
          sort_order: number
          updated_at: string | null
          what_becomes_fixed: string
          why_it_matters: string
        }
        Insert: {
          clickup_task_id: string
          created_at?: string | null
          id?: string
          sort_order?: number
          updated_at?: string | null
          what_becomes_fixed?: string
          why_it_matters?: string
        }
        Update: {
          clickup_task_id?: string
          created_at?: string | null
          id?: string
          sort_order?: number
          updated_at?: string | null
          what_becomes_fixed?: string
          why_it_matters?: string
        }
        Relationships: []
      }
      task_cache: {
        Row: {
          approved_credits: number | null
          clickup_id: string
          clickup_url: string | null
          created_at: string | null
          created_by_name: string | null
          created_by_user_id: string | null
          credits: number | null
          departments: string[] | null
          description: string | null
          due_date: string | null
          id: string
          is_visible: boolean | null
          last_activity_at: string
          last_synced: string | null
          list_id: string | null
          list_name: string | null
          name: string
          priority: string | null
          priority_color: string | null
          profile_id: string
          raw_data: Json | null
          status: string
          status_color: string | null
        }
        Insert: {
          approved_credits?: number | null
          clickup_id: string
          clickup_url?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          credits?: number | null
          departments?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_visible?: boolean | null
          last_activity_at?: string
          last_synced?: string | null
          list_id?: string | null
          list_name?: string | null
          name: string
          priority?: string | null
          priority_color?: string | null
          profile_id: string
          raw_data?: Json | null
          status: string
          status_color?: string | null
        }
        Update: {
          approved_credits?: number | null
          clickup_id?: string
          clickup_url?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          credits?: number | null
          departments?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_visible?: boolean | null
          last_activity_at?: string
          last_synced?: string | null
          list_id?: string | null
          list_name?: string | null
          name?: string
          priority?: string | null
          priority_color?: string | null
          profile_id?: string
          raw_data?: Json | null
          status?: string
          status_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_cache_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      visible_task_cache: {
        Row: {
          approved_credits: number | null
          clickup_id: string | null
          clickup_url: string | null
          created_at: string | null
          created_by_name: string | null
          created_by_user_id: string | null
          credits: number | null
          departments: string[] | null
          description: string | null
          due_date: string | null
          id: string | null
          is_visible: boolean | null
          last_activity_at: string | null
          last_synced: string | null
          list_id: string | null
          list_name: string | null
          name: string | null
          priority: string | null
          priority_color: string | null
          profile_id: string | null
          raw_data: Json | null
          status: string | null
          status_color: string | null
        }
        Insert: {
          approved_credits?: number | null
          clickup_id?: string | null
          clickup_url?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          credits?: number | null
          departments?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_visible?: boolean | null
          last_activity_at?: string | null
          last_synced?: string | null
          list_id?: string | null
          list_name?: string | null
          name?: string | null
          priority?: string | null
          priority_color?: string | null
          profile_id?: string | null
          raw_data?: Json | null
          status?: string | null
          status_color?: string | null
        }
        Update: {
          approved_credits?: number | null
          clickup_id?: string | null
          clickup_url?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          credits?: number | null
          departments?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          is_visible?: boolean | null
          last_activity_at?: string | null
          last_synced?: string | null
          list_id?: string | null
          list_name?: string | null
          name?: string | null
          priority?: string | null
          priority_color?: string | null
          profile_id?: string | null
          raw_data?: Json | null
          status?: string | null
          status_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_cache_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_user_see_task: {
        Args: {
          p_task_creator_id: string
          p_task_departments: string[]
          p_user_id: string
        }
        Returns: boolean
      }
      get_credit_balance: { Args: { p_profile_id: string }; Returns: number }
      get_org_credit_balance: { Args: { p_org_id: string }; Returns: number }
      get_org_members_enriched: {
        Args: { p_org_id: string }
        Returns: {
          accepted_at: string
          created_at: string
          departments: string[]
          id: string
          invited_email: string
          organization_id: string
          profile_email: string
          profile_full_name: string
          profile_id: string
          role: string
        }[]
      }
      get_visible_member_profile_ids: {
        Args: {
          p_org_id: string
          p_task_creator_id: string
          p_task_departments: string[]
        }
        Returns: {
          profile_id: string
        }[]
      }
      upsert_task_deduction: {
        Args: {
          p_amount: number
          p_description: string
          p_organization_id: string
          p_profile_id: string
          p_task_id: string
          p_task_name: string
        }
        Returns: {
          amount: number
          created_at: string
          description: string | null
          id: string
          organization_id: string
          profile_id: string
          task_id: string | null
          task_name: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_org_ids: { Args: never; Returns: string[] }
      user_org_role: { Args: { org_id: string }; Returns: string }
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
