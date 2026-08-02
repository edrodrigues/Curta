export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          credits: number
          id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          credits: number
          id?: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          credits?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "credit_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          credits: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          redemptions_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          credits: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redemptions_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          credits?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redemptions_count?: number
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          credits: number
          id: string
          is_featured: boolean
          price_cents: number
          slug: string
        }
        Insert: {
          credits: number
          id?: string
          is_featured?: boolean
          price_cents: number
          slug: string
        }
        Update: {
          credits?: number
          id?: string
          is_featured?: boolean
          price_cents?: number
          slug?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          related_order_nsu: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason: string
          related_order_nsu?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          related_order_nsu?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_wallets: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          infinitepay_invoice_slug: string | null
          kind: string
          order_nsu: string
          package_slug: string | null
          paid_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          infinitepay_invoice_slug?: string | null
          kind: string
          order_nsu: string
          package_slug?: string | null
          paid_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          infinitepay_invoice_slug?: string | null
          kind?: string
          order_nsu?: string
          package_slug?: string | null
          paid_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          audio_url: string | null
          created_at: string
          credits_charged: number | null
          duracao_segundos: number | null
          estilo_narracao: string | null
          estilo_trilha: string | null
          id: string
          link_origem: string | null
          roteiro: string | null
          srt_url: string | null
          status: string
          titulo: string | null
          updated_at: string
          user_id: string
          video_format: string | null
          video_url: string | null
          wizard_state: Json | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          credits_charged?: number | null
          duracao_segundos?: number | null
          estilo_narracao?: string | null
          estilo_trilha?: string | null
          id?: string
          link_origem?: string | null
          roteiro?: string | null
          srt_url?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
          user_id: string
          video_format?: string | null
          video_url?: string | null
          wizard_state?: Json | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          credits_charged?: number | null
          duracao_segundos?: number | null
          estilo_narracao?: string | null
          estilo_trilha?: string | null
          id?: string
          link_origem?: string | null
          roteiro?: string | null
          srt_url?: string | null
          status?: string
          titulo?: string | null
          updated_at?: string
          user_id?: string
          video_format?: string | null
          video_url?: string | null
          wizard_state?: Json | null
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          created_at: string
          endpoint: string | null
          error_message: string | null
          id: string
          input: Json | null
          kind: string
          monid_run_id: string | null
          output: Json | null
          project_id: string
          provider: string | null
          scene_index: number | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          input?: Json | null
          kind: string
          monid_run_id?: string | null
          output?: Json | null
          project_id: string
          provider?: string | null
          scene_index?: number | null
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          input?: Json | null
          kind?: string
          monid_run_id?: string | null
          output?: Json | null
          project_id?: string
          provider?: string | null
          scene_index?: number | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      redeem_coupon: {
        Args: {
          p_code: string
          p_user_id: string
        }
        Returns: {
          ok: boolean
          message: string | null
          credits: number | null
        }[]
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