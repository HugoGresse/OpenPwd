
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_email": string,"actor_id": string | null,"client_ip": string | null,"created_at": string,"detail": NonNullable<Json>,"entry_id": string | null,"entry_title": string | null,"id": number,"org_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email": string,"actor_id"?: string | null,"client_ip"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entry_id"?: string | null,"entry_title"?: string | null,"id"?: never,"org_id": string,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string,"actor_id"?: string | null,"client_ip"?: string | null,"created_at"?: string,"detail"?: NonNullable<Json>,"entry_id"?: string | null,"entry_title"?: string | null,"id"?: never,"org_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"field_labels": (string)[],"has_note": boolean,"id": string,"kms_key_name": string | null,"last_accessed_at": string | null,"last_accessed_by": string | null,"org_id": string,"secret_ciphertext": string,"secret_version": number,"title": string,"updated_at": string,"updated_by": string | null,"url": string | null,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"field_labels"?: (string)[],"has_note"?: boolean,"id": string,"kms_key_name"?: string | null,"last_accessed_at"?: string | null,"last_accessed_by"?: string | null,"org_id": string,"secret_ciphertext": string,"secret_version"?: number,"title": string,"updated_at"?: string,"updated_by"?: string | null,"url"?: string | null,"username"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"field_labels"?: (string)[],"has_note"?: boolean,"id"?: string,"kms_key_name"?: string | null,"last_accessed_at"?: string | null,"last_accessed_by"?: string | null,"org_id"?: string,"secret_ciphertext"?: string,"secret_version"?: number,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"url"?: string | null,"username"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_last_accessed_by_fkey"
      columns: ["last_accessed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entries_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_versions": {
                  Row: {
                    "entry_id": string,"kms_key_name": string | null,"replaced_at": string,"replaced_by": string | null,"secret_ciphertext": string,"secret_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "entry_id": string,"kms_key_name"?: string | null,"replaced_at"?: string,"replaced_by"?: string | null,"secret_ciphertext": string,"secret_version": number
                  }
                  Update: {
                    "entry_id"?: string,"kms_key_name"?: string | null,"replaced_at"?: string,"replaced_by"?: string | null,"secret_ciphertext"?: string,"secret_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_versions_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_versions_replaced_by_fkey"
      columns: ["replaced_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invites": {
                  Row: {
                    "created_at": string,"email": string,"invited_by": string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"invited_by"?: string | null,"org_id": string,"role"?: Database["public"]['Enums']["org_role"]
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"invited_by"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "added_by": string | null,"created_at": string,"org_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"org_id": string,"role"?: Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kms_key_name": string | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kms_key_name"?: string | null,"name": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kms_key_name"?: string | null,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_member":
{ Args: { "p_email": string,"p_org_id": string,"p_role": Database["public"]['Enums']["org_role"] }; Returns: string
                           },
"create_entry":
{ Args: { "p_ciphertext": string,"p_entry_id": string,"p_field_labels": (string)[],"p_has_note": boolean,"p_key_name"?: string,"p_org_id": string,"p_title": string,"p_url": string,"p_username": string }; Returns: undefined
                           },
"create_organization":
{ Args: { "p_name": string }; Returns: string
                           },
"delete_entry":
{ Args: { "p_entry_id": string }; Returns: undefined
                           },
"health":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"remove_invite":
{ Args: { "p_email": string,"p_org_id": string }; Returns: undefined
                           },
"remove_member":
{ Args: { "p_org_id": string,"p_user_id": string }; Returns: undefined
                           },
"reveal_entry":
{ Args: { "p_action": string,"p_entry_id": string,"p_field": string }; Returns: {
              "ciphertext": string,"key_name": string,"version": number
            }[]
                           },
"session_is_current":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"set_member_role":
{ Args: { "p_org_id": string,"p_role": Database["public"]['Enums']["org_role"],"p_user_id": string }; Returns: undefined
                           },
"update_entry":
{ Args: { "p_ciphertext": string,"p_entry_id": string,"p_field_labels": (string)[],"p_has_note": boolean,"p_key_name"?: string,"p_secret_version": number,"p_title": string,"p_url": string,"p_username": string }; Returns: undefined
                           }
          }
          Enums: {
            "org_role": "owner"|"admin"|"member"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "org_role": ["owner", "admin", "member"]
          }
        }
} as const
