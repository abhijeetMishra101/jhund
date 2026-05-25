import { createServiceClient } from '@/lib/supabase/server'
import { ROLE_CATALOG } from './roles'

// ── Bot roles seeded at workspace creation ─────────────────────────────────
// All 7 roles are always inserted so founders can hire any of them later.
// Channels are template-specific (only startup/enterprise get all channels).

const SEED_ROLE_KEYS = ['ops', 'product', 'backend', 'design', 'security', 'qa', 'ml']

// ── Per-template channel definitions ───────────────────────────────────────

const TEMPLATE_CHANNELS: Record<string, { name: string; display_name: string; role_key: string }[]> = {
  startup: [
    { name: 'ops',           display_name: '# ops',           role_key: 'ops' },
    { name: 'decisions',     display_name: '# decisions',     role_key: 'ops' },
    { name: 'product',       display_name: '# product',       role_key: 'product' },
    { name: 'engineering',   display_name: '# engineering',   role_key: 'backend' },
    { name: 'design',        display_name: '# design',        role_key: 'design' },
    { name: 'security',      display_name: '# security',      role_key: 'security' },
    { name: 'qa',            display_name: '# qa',            role_key: 'qa' },
    { name: 'ml',            display_name: '# ml',            role_key: 'ml' },
    { name: 'standup',       display_name: '# standup',       role_key: 'ops' },
    { name: 'retrospective', display_name: '# retrospective', role_key: 'ops' },
  ],
  enterprise: [
    { name: 'ops',           display_name: '# ops',           role_key: 'ops' },
    { name: 'decisions',     display_name: '# decisions',     role_key: 'ops' },
    { name: 'product',       display_name: '# product',       role_key: 'product' },
    { name: 'engineering',   display_name: '# engineering',   role_key: 'backend' },
    { name: 'design',        display_name: '# design',        role_key: 'design' },
    { name: 'security',      display_name: '# security',      role_key: 'security' },
    { name: 'qa',            display_name: '# qa',            role_key: 'qa' },
    { name: 'ml',            display_name: '# ml',            role_key: 'ml' },
    { name: 'standup',       display_name: '# standup',       role_key: 'ops' },
    { name: 'retrospective', display_name: '# retrospective', role_key: 'ops' },
  ],
  blank: [
    { name: 'ops',           display_name: '# ops',           role_key: 'ops' },
    { name: 'decisions',     display_name: '# decisions',     role_key: 'ops' },
    { name: 'standup',       display_name: '# standup',       role_key: 'ops' },
    { name: 'retrospective', display_name: '# retrospective', role_key: 'ops' },
  ],
}

// ── Public seeder ───────────────────────────────────────────────────────────

export async function seedWorkspace(
  workspaceId: string,
  workspaceName: string,
  template: 'startup' | 'enterprise' | 'blank'
): Promise<void> {
  const supabase = createServiceClient()

  // Insert all 7 bot_roles so founders can hire any mid-project
  const { data: roles, error: rolesError } = await supabase
    .from('bot_roles')
    .insert(
      SEED_ROLE_KEYS.map((key) => {
        const def = ROLE_CATALOG[key]
        return {
          workspace_id: workspaceId,
          role_key: def.role_key,
          display_name: def.display_name,
          avatar_seed: def.avatar_seed,
          system_prompt: def.system_prompt.replace('{workspace_name}', workspaceName),
        }
      })
    )
    .select('id, role_key')

  if (rolesError) throw new Error(`Failed to seed bot_roles: ${rolesError.message}`)

  // Build role_key → id map
  const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.role_key, r.id]))

  // Insert template channels — select back so we get IDs for channel_members
  const channelDefs = TEMPLATE_CHANNELS[template] ?? TEMPLATE_CHANNELS.startup
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .insert(
      channelDefs.map((c, idx) => ({
        workspace_id: workspaceId,
        name: c.name,
        display_name: c.display_name,
        bot_role_id: roleMap[c.role_key] ?? null,
        position: idx,
      }))
    )
    .select('id, name')

  if (channelsError || !channels) throw new Error(`Failed to seed channels: ${channelsError?.message}`)

  // Seed channel_members — each channel's primary bot gets is_primary: true
  const memberRows = channelDefs
    .map((c, idx) => ({
      channel_id: channels[idx]?.id,
      bot_role_id: roleMap[c.role_key],
      is_primary: true,
    }))
    .filter((r) => r.channel_id && r.bot_role_id)

  if (memberRows.length > 0) {
    const { error: membersError } = await supabase
      .from('channel_members')
      .insert(memberRows)

    if (membersError) throw new Error(`Failed to seed channel_members: ${membersError.message}`)
  }
}
