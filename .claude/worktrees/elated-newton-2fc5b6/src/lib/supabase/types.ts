export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          vertical_type: 'accommodation' | 'fnb' | 'hybrid'
          plan: 'starter' | 'growth' | 'pro'
          plan_expires_at: string | null
          plan_activated_at: string | null
          is_trial: boolean
          trial_started_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          vertical_type: 'accommodation' | 'fnb' | 'hybrid'
          plan?: 'starter' | 'growth' | 'pro'
          plan_expires_at?: string | null
          plan_activated_at?: string | null
          is_trial?: boolean
          trial_started_at?: string | null
        }
        Update: Record<string, unknown>
      }
      branches: {
        Row: {
          id: string
          organization_id: string
          name: string
          branch_name: string | null
          business_type: string
          module_type: string | null
          total_rooms: number | null
          accommodation_staff_count: number | null
          total_seats: number | null
          sort_order: number | null
          city: string | null
          province: string | null
          zip_code: string | null
          operating_days: Record<string, boolean> | null
          business_day_cutoff_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          organization_id: string
          name: string
          business_type: string
          total_rooms?: number | null
          total_seats?: number | null
          [key: string]: unknown
        }
        Update: Record<string, unknown>
      }
      daily_metrics: {
        Row: {
          id: string
          branch_id: string
          metric_date: string
          revenue: number
          rooms_sold: number | null
          adr: number | null
          customers: number | null
          avg_ticket: number | null
          cash_balance: number | null
          cost: number | null
          channel_direct: number | null
          channel_ota: number | null
          cost_food: number | null
          cost_nonfood: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          branch_id: string
          metric_date: string
          revenue: number
          rooms_sold?: number | null
          adr?: number | null
          customers?: number | null
          avg_ticket?: number | null
          cash_balance?: number | null
          cost?: number | null
          channel_direct?: number | null
          channel_ota?: number | null
          cost_food?: number | null
          cost_nonfood?: number | null
          notes?: string | null
        }
        Update: {
          revenue?: number
          rooms_sold?: number | null
          adr?: number | null
          customers?: number | null
          avg_ticket?: number | null
          cost?: number | null
          channel_direct?: number | null
          channel_ota?: number | null
          cost_food?: number | null
          cost_nonfood?: number | null
          notes?: string | null
          [key: string]: unknown
        }
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'owner' | 'manager'
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: 'owner' | 'manager'
          invited_by?: string | null
        }
        Update: Record<string, unknown>
      }
      branch_members: {
        Row: {
          id: string
          branch_id: string
          user_id: string
          role: 'branch_manager' | 'branch_user' | 'viewer'
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          branch_id: string
          user_id: string
          role: 'branch_manager' | 'branch_user' | 'viewer'
          invited_by?: string | null
        }
        Update: Record<string, unknown>
      }
      platform_admins: {
        Row: { user_id: string; created_at: string }
        Insert: { user_id: string; created_at?: string }
        Update: Record<string, unknown>
      }
      targets: {
        Row: {
          id: string
          branch_id: string
          organization_id: string | null
          adr_target: number | null
          occ_target: number | null
          occupancy_target: number | null
          direct_booking_target: number | null
          revpar_target: number | null
          labour_target: number | null
          covers_target: number | null
          cogs_target: number | null
          avg_spend_target: number | null
          monthly_salary: number
          operating_days: number
          labour_alert_threshold: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          organization_id?: string | null
          adr_target?: number | null
          occupancy_target?: number | null
          direct_booking_target?: number | null
          revpar_target?: number | null
          labour_target?: number | null
          covers_target?: number | null
          cogs_target?: number | null
          avg_spend_target?: number | null
          monthly_salary?: number
          operating_days?: number
          labour_alert_threshold?: number | null
          [key: string]: unknown
        }
        Update: Record<string, unknown>
      }
      audit_log: {
        Row: {
          id: string
          actor_user_id: string | null
          organization_id: string | null
          action: string
          target_entity: string | null
          target_id: string | null
          payload: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          actor_user_id?: string | null
          organization_id?: string | null
          action: string
          target_entity?: string | null
          target_id?: string | null
          payload?: Record<string, unknown> | null
        }
        Update: Record<string, unknown>
      }
      invitations: {
        Row: {
          id: string
          organization_id: string
          branch_id: string | null
          invitee_email: string
          role: 'manager' | 'staff'
          token: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          organization_id: string
          branch_id?: string | null
          invitee_email: string
          role: 'manager' | 'staff'
          invited_by?: string | null
          expires_at?: string
        }
        Update: Record<string, unknown>
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string | null
          phone: string | null
          line_id: string | null
          language: 'th' | 'en'
          timezone: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name?: string | null
          phone?: string | null
          line_id?: string | null
          language?: 'th' | 'en'
          timezone?: string
        }
        Update: Record<string, unknown>
      }
      notification_settings: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          email_notifications: boolean
          line_notify_enabled: boolean
          line_notify_token: string | null
          morning_flash_time: string
          entry_reminder_enabled: boolean
          entry_reminder_time: string
          labour_alert_enabled: boolean
          cogs_alert_enabled: boolean
          weekly_report_enabled: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          organization_id: string
          email_notifications?: boolean
          line_notify_enabled?: boolean
          [key: string]: unknown
        }
        Update: Record<string, unknown>
      }
    }
    Views: {
      branch_status_current: { Row: Record<string, unknown> }
      branch_daily_metrics: { Row: Record<string, unknown> }
    }
    Functions: {
      is_super_admin: { Args: Record<string, never>; Returns: boolean }
    }
  }
}

// Convenience types
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Branch = Database['public']['Tables']['branches']['Row']
export type DailyMetric = Database['public']['Tables']['daily_metrics']['Row']
export type DailyMetricInsert = Database['public']['Tables']['daily_metrics']['Insert']
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row']
export type BranchMember = Database['public']['Tables']['branch_members']['Row']
export type Target = Database['public']['Tables']['targets']['Row']
export type Invitation = Database['public']['Tables']['invitations']['Row']
export type InvitationInsert = Database['public']['Tables']['invitations']['Insert']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type NotificationSettings = Database['public']['Tables']['notification_settings']['Row']

export type AppRole = 'owner' | 'manager' | 'staff' | 'superadmin'
export type BranchType = 'accommodation' | 'fnb'

export interface UserContext {
  user: { id: string; email: string }
  role: AppRole
  organization: Organization | null
  branches: Branch[]
  activeBranch: Branch | null
  plan: Organization['plan']
  isSuperAdmin: boolean
}
