export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          template: 'startup' | 'enterprise' | 'blank'
          action_cap: number
          actions_used: number
          working_style: 'hands-off' | 'balanced' | 'hands-on'
          github_installation_id: string | null
          github_repo: string | null
          last_standup_at: string | null
          last_retro_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          template?: 'startup' | 'enterprise' | 'blank'
          action_cap?: number
          actions_used?: number
          working_style?: 'hands-off' | 'balanced' | 'hands-on'
          github_installation_id?: string | null
          github_repo?: string | null
          last_standup_at?: string | null
          last_retro_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          template?: 'startup' | 'enterprise' | 'blank'
          action_cap?: number
          actions_used?: number
          working_style?: 'hands-off' | 'balanced' | 'hands-on'
          github_installation_id?: string | null
          github_repo?: string | null
          last_standup_at?: string | null
          last_retro_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          workspace_id: string
          role: string
          created_at: string
        }
        Insert: {
          id: string
          workspace_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          id: string
          workspace_id: string
          name: string
          display_name: string
          bot_role_id: string | null
          position: number
          archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          display_name: string
          bot_role_id?: string | null
          position?: number
          archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          display_name?: string
          bot_role_id?: string | null
          position?: number
          archived?: boolean
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          author_type: 'user' | 'bot' | 'system'
          author_id: string
          content: string
          plan_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          author_type: 'user' | 'bot' | 'system'
          author_id: string
          content: string
          plan_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          author_type?: 'user' | 'bot' | 'system'
          author_id?: string
          content?: string
          plan_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      bot_roles: {
        Row: {
          id: string
          workspace_id: string
          role_key: string
          display_name: string
          system_prompt: string
          avatar_seed: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          role_key: string
          display_name: string
          system_prompt: string
          avatar_seed: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          role_key?: string
          display_name?: string
          system_prompt?: string
          avatar_seed?: string
          created_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          channel_id: string
          bot_role_id: string
          description_md: string
          github_actions: Json
          status: 'pending' | 'approved' | 'executing' | 'rejected' | 'executed' | 'failed'
          approved_by: string | null
          approved_at: string | null
          executed_at: string | null
          failure_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          bot_role_id: string
          description_md: string
          github_actions?: Json
          status?: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
          approved_by?: string | null
          approved_at?: string | null
          executed_at?: string | null
          failure_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          bot_role_id?: string
          description_md?: string
          github_actions?: Json
          status?: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
          approved_by?: string | null
          approved_at?: string | null
          executed_at?: string | null
          failure_reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      github_installations: {
        Row: {
          id: string
          workspace_id: string
          installation_id: string
          repo_full_name: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          installation_id: string
          repo_full_name: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          installation_id?: string
          repo_full_name?: string
          created_at?: string
        }
        Relationships: []
      }
      github_triggers: {
        Row: {
          id: string
          workspace_id: string
          event_type: string
          label_filter: string | null
          channel_id: string
          bot_role_id: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          event_type: string
          label_filter?: string | null
          channel_id: string
          bot_role_id: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          event_type?: string
          label_filter?: string | null
          channel_id?: string
          bot_role_id?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_action_count: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience row types
export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type BotRole = Database['public']['Tables']['bot_roles']['Row']
export type Plan = Database['public']['Tables']['plans']['Row']
export type GithubInstallation = Database['public']['Tables']['github_installations']['Row']
export type GithubTrigger = Database['public']['Tables']['github_triggers']['Row']
