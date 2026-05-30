import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { buildMessageHistory } from './context'
import { READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL } from './tools'
import { readGithubFile, listDirectory, FileNotFoundError, FileAccessDeniedError, DirectoryNotFoundError, DirectoryAccessDeniedError } from '@/lib/github/reader'
import { isAutoApprovable } from './auto-approve'
import { executePlanActions } from '@/lib/github/executor'
import { advanceStage } from '@/lib/feature-stages'
import { getDispatchTargets, postHandoffMessage } from '@/lib/feature-stages/dispatch'
import { recordDecision } from '@/lib/decisions/record'
import { postDecisionMessage, markDecisionDispatched, postDecisionSummary } from '@/lib/decisions/dispatch'
import { commitDiscussionDoc } from '@/lib/decisions/github-commit'
import { undoDecision } from '@/lib/decisions/undo'
import { getRoleSystemPrompt } from '@/lib/templates/roles'
import type { BotRole } from '@/lib/supabase/types'
import type { GateType } from '@/lib/feature-stages'

export { READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL } from './tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Public API ──────────────────────────────────────────────────────────────

/** Returns the bot_role configured for a channel, or null if none assigned */
export async function getBotForChannel(channelId: string): Promise<BotRole | null> {
  const supabase = createServiceClient()

  const { data: channel } = await supabase
    .from('channels')
    .select('bot_role_id')
    .eq('id', channelId)
    .single()

  if (!channel?.bot_role_id) return null

  const { data: botRole } = await supabase
    .from('bot_roles')
    .select()
    .eq('id', channel.bot_role_id)
    .single()

  return botRole ?? null
}

/**
 * Resolves which bot should respond to a message in a channel.
 *
 * Multi-bot routing rules:
 * - If the message starts with @Name, route to the named bot (case-insensitive)
 * - Otherwise route to the primary bot (is_primary = true) in channel_members
 * - Falls back to channels.bot_role_id if no channel_members rows exist
 */
export async function resolveBotForMessage(
  channelId: string,
  messageContent?: string
): Promise<BotRole | null> {
  const supabase = createServiceClient()

  // Fetch all members of this channel ordered by insert time (primary first)
  const { data: memberRows } = await supabase
    .from('channel_members')
    .select('bot_role_id, is_primary')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })

  if (!memberRows || memberRows.length === 0) {
    // Fallback: legacy single-bot via channels.bot_role_id
    return getBotForChannel(channelId)
  }

  // Fetch bot_role details for all members
  const botRoleIds = memberRows.map((m) => m.bot_role_id)
  const { data: botRoleRows } = await supabase
    .from('bot_roles')
    .select()
    .in('id', botRoleIds)

  const botRoleMap = new Map<string, BotRole>((botRoleRows ?? []).map((b) => [b.id, b]))

  // If message starts with @Name, try to match a bot
  if (messageContent) {
    const mentionMatch = messageContent.match(/^@(\w+)/i)
    if (mentionMatch) {
      const mentionedName = mentionMatch[1].toLowerCase()
      const mentionedRow = memberRows.find((m) => {
        const bot = botRoleMap.get(m.bot_role_id)
        return bot?.display_name?.toLowerCase() === mentionedName
      })
      if (mentionedRow) return botRoleMap.get(mentionedRow.bot_role_id) ?? null
    }
  }

  // Default: primary bot
  const primaryRow = memberRows.find((m) => m.is_primary) ?? memberRows[0]
  return botRoleMap.get(primaryRow.bot_role_id) ?? null
}

/**
 * Generates a bot reply for the given channel and stores it as a message row.
 *
 * Flow:
 *   1. Resolve which bot should respond (multi-bot routing)
 *   2. Build message history (last 20 turns)
 *   3. Call Claude with cached system prompt + propose_github_action tool
 *   4a. If Claude used the tool: create a plans row (status=pending), store message with plan_id
 *   4b. Otherwise: store plain text reply
 *   5. Return stored message id
 *
 * @param channelId - The channel to respond in
 * @param workspaceId - The workspace (used for context)
 * @param parentMessageId - If set, bot reply is posted as a thread reply
 * @param messageContent - The triggering message content (used for @mention routing)
 */
export async function respondToMessage(
  channelId: string,
  workspaceId: string,
  parentMessageId?: string,
  messageContent?: string
): Promise<string> {
  const supabase = createServiceClient()

  // 1. Resolve bot role (supports multi-bot @mention routing)
  const botRole = await resolveBotForMessage(channelId, messageContent)
  if (!botRole) throw new Error(`No bot configured for channel ${channelId}`)

  // 2. Build conversation history (pass workspaceId so trigger-only system
  //    messages are included while confirmation/error chips are excluded)
  const messageHistory = await buildMessageHistory(channelId, 20, workspaceId)

  if (messageHistory.length === 0) {
    throw new Error('No messages to respond to')
  }

  // 3. Fetch workspace name so we can generate the system prompt fresh from code.
  // We intentionally do NOT use botRole.system_prompt from the DB — prompts are
  // always derived from the latest roles.ts so every workspace gets improvements
  // on deploy without re-seeding or migrations.
  const { data: workspaceRow } = await supabase
    .from('workspaces')
    .select('name, bot_context')
    .eq('id', workspaceId)
    .single()

  const basePrompt = workspaceRow?.name
    ? getRoleSystemPrompt(botRole.role_key, workspaceRow.name)
    : botRole.system_prompt // fallback: should never happen in practice

  const botContext = workspaceRow?.bot_context?.trim()
  const systemPromptText = botContext
    ? `${basePrompt}\n\n## Project Context\n${botContext}`
    : basePrompt

  // 4. Call Claude with cached system prompt + tools.
  //
  // WORK LOOP — handles two kinds of iterations:
  //   (a) File reads: read_github_file / list_directory resolved inline (existing behaviour)
  //   (b) Auto-approvable actions: commit_file / patch_github_file on bot/* branches
  //       executed inline and result fed back so Claude can continue working.
  //
  // Exits when Claude returns: a non-auto action (plan chip), advance_feature_stage,
  // create_feature, record_decision, document_discussion, plain text, or cap reached.
  //
  // MAX_WORK_ITERATIONS covers both reads and action steps combined.
  const MAX_WORK_ITERATIONS = 10
  const tools = [READ_GITHUB_FILE_TOOL, LIST_DIRECTORY_TOOL, PROPOSE_GITHUB_ACTION_TOOL, ADVANCE_FEATURE_STAGE_TOOL, CREATE_FEATURE_TOOL, RECORD_DECISION_TOOL, DOCUMENT_DISCUSSION_TOOL, UNDO_DECISION_TOOL]
  const system = [
    {
      type: 'text' as const,
      text: systemPromptText,
      cache_control: { type: 'ephemeral' as const },
    },
  ]

  // Mutable messages array so we can append tool_results
  const messages = [...messageHistory]

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools,
    system,
    messages,
  })

  for (let iteration = 0; iteration < MAX_WORK_ITERATIONS; iteration++) {
    // ── (a) File reads ────────────────────────────────────────────────────────
    // Collect ALL read_github_file and list_directory tool_use blocks (parallel reads).
    // We must provide tool_result blocks for EVERY tool_use in the response — missing
    // any one causes a 400 "tool_use ids without tool_result blocks" error from the API.
    const readBlocks = response.content.filter(
      (b) => b.type === 'tool_use' &&
        ((b as Anthropic.ToolUseBlock).name === 'read_github_file' ||
         (b as Anthropic.ToolUseBlock).name === 'list_directory')
    ) as Anthropic.ToolUseBlock[]

    if (readBlocks.length > 0) {
      const toolResults = await Promise.all(
        readBlocks.map(async (readBlock) => {
          const input = readBlock.input as { path: string; branch?: string }
          let content: string

          if (readBlock.name === 'list_directory') {
            try {
              const result = await listDirectory(workspaceId, input.path, input.branch)
              content = JSON.stringify(result)
            } catch (err) {
              if (err instanceof DirectoryNotFoundError) {
                content = `Directory not found: ${input.path}`
              } else if (err instanceof DirectoryAccessDeniedError) {
                content = `Access denied: ${input.path}`
              } else {
                const message = err instanceof Error ? err.message : 'Unknown error'
                content = `Error listing ${input.path}: ${message}`
              }
            }
          } else {
            try {
              const result = await readGithubFile(workspaceId, input.path, input.branch)
              content = result.content
            } catch (err) {
              if (err instanceof FileNotFoundError) {
                content = `File not found: ${input.path}`
              } else if (err instanceof FileAccessDeniedError) {
                content = `Access denied: ${input.path}`
              } else {
                const message = err instanceof Error ? err.message : 'Unknown error'
                content = `Error reading ${input.path}: ${message}`
              }
            }
          }

          return { type: 'tool_result' as const, tool_use_id: readBlock.id, content }
        })
      )

      messages.push(
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults }
      )

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools,
        system,
        messages,
      })
      continue
    }

    // ── (b) Auto-approvable GitHub actions ────────────────────────────────────
    // If Claude called propose_github_action with confidence='auto' and the
    // server-side allowlist passes, execute inline and feed the result back.
    // This lets bots chain: read → commit → patch → commit → … → create_pr (stops here).
    const proposeBlock = response.content.find(
      (b) => b.type === 'tool_use' && (b as Anthropic.ToolUseBlock).name === 'propose_github_action'
    ) as Anthropic.ToolUseBlock | undefined

    if (proposeBlock) {
      const input = proposeBlock.input as {
        plain_english_description: string
        actions: Array<{ action_type: string; payload: Record<string, unknown> }>
        confidence?: 'auto' | 'review'
      }

      const actionsRaw = input.actions
      const actions: Array<{ action_type: string; payload: Record<string, unknown> }> =
        Array.isArray(actionsRaw) ? actionsRaw : actionsRaw ? [actionsRaw as never] : []

      if (input.confidence === 'auto' && isAutoApprovable(actions) && actions.length > 0) {
        // Execute the actions inline
        const { data: plan, error: planError } = await supabase
          .from('plans')
          .insert({
            channel_id: channelId,
            bot_role_id: botRole.id,
            description_md: input.plain_english_description,
            github_actions: actions as unknown as import('@/lib/supabase/types').Json,
            status: 'pending',
            auto_approved: true,
          } as never)
          .select('id')
          .single()

        if (planError || !plan) {
          throw new Error(`Failed to create plan: ${planError?.message ?? 'no data'}`)
        }

        // Post visible system message so founder can see what's happening
        await supabase.from('messages').insert({
          channel_id: channelId,
          author_type: 'system',
          author_id: workspaceId,
          content: `⚡ Auto-executing: ${input.plain_english_description}`,
          ...(parentMessageId ? { parent_id: parentMessageId } : {}),
        })

        await supabase
          .from('plans')
          .update({ status: 'approved', approved_at: new Date().toISOString() } as never)
          .eq('id', plan.id)

        let execResult: string
        try {
          await executePlanActions(plan.id, workspaceId)
          execResult = `✅ Done: ${input.plain_english_description}\nActions completed: ${actions.map((a) => a.action_type).join(', ')}`
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          execResult = `❌ Failed: ${msg}. You may need to adjust your approach.`
        }

        // Feed result back to Claude so it can plan the next step
        messages.push(
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: proposeBlock.id, content: execResult }] }
        )

        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          tools,
          system,
          messages,
        })
        continue
      }
    }

    // ── Neither reads nor inline actions — hand off to outer handler ──────────
    break
  }

  // 5. Check if Claude used a tool (in the final response from the work loop)
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as
    | Anthropic.ToolUseBlock
    | undefined

  // Guard: if we exhausted MAX_WORK_ITERATIONS and Claude still wants to read/list, surface a friendly message.
  if (toolUseBlock?.name === 'read_github_file' || toolUseBlock?.name === 'list_directory') {
    const { data: stored } = await supabase.from('messages').insert({
      channel_id: channelId,
      author_type: 'system',
      author_id: botRole.id,
      content: "I ran into trouble reading the repo files. Try again or check your GitHub connection.",
      ...(parentMessageId ? { parent_id: parentMessageId } : {}),
    }).select('id').single()
    return stored?.id ?? 'cap-hit'
  }

  // 4a-i. Handle create_feature tool
  if (toolUseBlock?.name === 'create_feature') {
    const input = toolUseBlock.input as {
      title: string
      description: string
      complexity: 'hotfix' | 'small' | 'medium' | 'large'
    }

    let systemContent: string
    try {
      const { data: feature, error: featureError } = await supabase
        .from('features')
        .insert({
          workspace_id: workspaceId,
          title: input.title.trim(),
          description: input.description.trim(),
          complexity: input.complexity,
          stage: 1,
          status: 'active' as const,
        })
        .select('id')
        .single()

      if (featureError || !feature) {
        throw new Error(featureError?.message ?? 'Insert returned no data')
      }

      systemContent = `✓ Feature "${input.title}" created in Pipeline (Stage 1 — Idea). ID: ${feature.id}`
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Failed to create feature: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-ii. Handle record_decision tool
  if (toolUseBlock?.name === 'record_decision') {
    const input = toolUseBlock.input as {
      title: string
      summary: string
      action?: string
    }

    let systemContent: string
    try {
      const decision = await recordDecision({
        workspaceId,
        channelId,
        botRoleId: botRole.id,
        title: input.title,
        summary: input.summary,
        action: input.action,
      })

      systemContent = `✓ Decision recorded: ${input.title}`

      // Always post a summary to #decisions so the channel captures every decision (fire-and-forget)
      postDecisionSummary(workspaceId, channelId, input.title, input.summary, botRole.id)
        .catch((err) => console.error('[decisions] postDecisionSummary failed:', err))

      // If an action was specified, additionally dispatch it to #decisions
      if (input.action) {
        postDecisionMessage(workspaceId, input.action, botRole.id)
          .then(async (result) => {
            if (!result) return
            try {
              await respondToMessage(result.decisionsChannelId, workspaceId)
              await markDecisionDispatched(decision.id)
            } catch (err) {
              console.error('[decisions] Dispatch failed for decision', decision.id, err)
            }
          })
          .catch((err) => console.error('[decisions] postDecisionMessage failed:', err))

        systemContent += ' Your team has been asked to act on this in #decisions.'
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Failed to record decision: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent!,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-iii. Handle document_discussion tool
  if (toolUseBlock?.name === 'document_discussion') {
    const input = toolUseBlock.input as {
      title: string
      summary: string
    }

    let systemContent: string
    try {
      const result = await commitDiscussionDoc({
        workspaceId,
        title: input.title,
        summary: input.summary,
      })

      if (result.committed) {
        systemContent = `✓ Discussion saved`
        if (result.url) systemContent += ` — [View the document](${result.url})`
      } else {
        systemContent = `Discussion summary saved (no GitHub connected yet): **${input.title}**\n\n${input.summary}`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Failed to document discussion: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent!,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-iv. Handle undo_decision tool
  if (toolUseBlock?.name === 'undo_decision') {
    let systemContent: string
    try {
      const result = await undoDecision(workspaceId, channelId, botRole.id)

      if (!result.undone) {
        // UC-19-15: nothing to undo
        systemContent = "I don't see a recent decision here to undo. Which one did you mean?"
      } else if (result.actionWasDispatched) {
        // UC-19-14: team was already notified — warn the founder
        systemContent =
          `Removed. Worth noting — the team already saw this. You may want to give them a heads-up.`
      } else {
        // UC-19-13: clean undo
        systemContent = `Done — I've quietly removed that from the record. It's like it never happened.`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Failed to undo decision: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-v. Handle advance_feature_stage tool
  if (toolUseBlock?.name === 'advance_feature_stage') {
    const input = toolUseBlock.input as {
      feature_id: string
      to_stage: number
      gate_type: GateType
      notes: string
    }

    let systemContent: string
    try {
      // Fetch feature title before advancing (for handoff messages)
      const { data: featureRow } = await supabase
        .from('features')
        .select('title')
        .eq('id', input.feature_id)
        .single()
      const featureTitle = featureRow?.title ?? 'Feature'

      await advanceStage(input.feature_id, input.to_stage, input.gate_type, botRole.role_key, input.notes)
      systemContent = `✓ Feature advanced to stage ${input.to_stage}: ${input.notes}`

      // Dispatch handoff to next stage owners (fire-and-forget, non-blocking)
      getDispatchTargets(workspaceId, input.to_stage)
        .then(async (targets) => {
          if (targets.length === 0) return
          const { parallel } = targets[0]

          const dispatchOne = async (target: typeof targets[0]) => {
            try {
              await postHandoffMessage(target.channelId, featureTitle, input.to_stage)
              await respondToMessage(target.channelId, workspaceId)
            } catch (err) {
              console.error('[dispatch] Handoff failed for channel', target.channelId, err)
            }
          }

          if (parallel) {
            await Promise.all(targets.map(dispatchOne))
          } else {
            for (const target of targets) await dispatchOne(target)
          }
        })
        .catch((err) => console.error('[dispatch] getDispatchTargets failed:', err))

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      systemContent = `Gate blocked: ${message}`
    }

    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: botRole.id,
        content: systemContent!,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store system message: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4a-v. Handle propose_github_action tool
  if (toolUseBlock) {
    const input = toolUseBlock.input as {
      plain_english_description: string
      actions: Array<{ action_type: string; payload: Record<string, unknown> }>
      confidence?: 'auto' | 'review'
    }

    // Normalise actions — Claude occasionally returns a single object instead of an array
    const actionsRaw = input.actions
    const actions: Array<{ action_type: string; payload: Record<string, unknown> }> =
      Array.isArray(actionsRaw) ? actionsRaw : actionsRaw ? [actionsRaw as never] : []

    console.log('[bot:tool_use] channel=%s role=%s actions=%s', channelId, botRole.role_key,
      JSON.stringify(actions.map((a) => a.action_type)))

    // Get any text Claude included alongside the tool call
    const textBlock = response.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined
    const introText = textBlock?.text?.trim() ?? ''

    const displayDescription = input.plain_english_description
    const botMessage =
      introText
        ? `${introText}\n\n**Proposed action:** ${displayDescription}`
        : `I'd like to: **${displayDescription}**\n\nPlease approve or reject this action.`

    // Empty actions — bot called the tool with no actions (e.g. dispatch-triggered response).
    // Fall through to plain text using any text Claude included alongside the tool call.
    if (!actions.length) {
      const fallbackText = introText || input.plain_english_description || ''
      if (!fallbackText) throw new Error('propose_github_action called with empty actions and no text')
      const { data: stored, error: insertError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          author_type: 'bot',
          author_id: botRole.id,
          content: fallbackText,
          ...(parentMessageId ? { parent_id: parentMessageId } : {}),
        })
        .select('id')
        .single()
      if (insertError || !stored) throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
      return stored.id
    }

    const confidence = input.confidence ?? 'review'

    // Auto-approve path: bot declared confidence='auto' AND server-side allowlist passes
    if (confidence === 'auto' && isAutoApprovable(actions)) {
      // 1. Insert plan row with auto_approved=true
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .insert({
          channel_id: channelId,
          bot_role_id: botRole.id,
          description_md: displayDescription,
          github_actions: actions as unknown as import('@/lib/supabase/types').Json,
          status: 'pending',
          auto_approved: true,
        } as never)
        .select('id')
        .single()

      if (planError || !plan) {
        throw new Error(`Failed to create plan: ${planError?.message ?? 'no data'}`)
      }

      // 2. Post a visible system message so the founder can see what's happening
      await supabase.from('messages').insert({
        channel_id: channelId,
        author_type: 'system',
        author_id: workspaceId,
        content: `⚡ Auto-executing: ${displayDescription}`,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })

      // 3. Mark as approved and execute — reuse existing executor
      await supabase
        .from('plans')
        .update({ status: 'approved', approved_at: new Date().toISOString() } as never)
        .eq('id', plan.id)

      await executePlanActions(plan.id, workspaceId)

      // 4. Post completion message
      const { data: stored, error: insertError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          author_type: 'system',
          author_id: workspaceId,
          content: 'Done — changes committed to GitHub.',
          ...(parentMessageId ? { parent_id: parentMessageId } : {}),
        })
        .select('id')
        .single()

      if (insertError || !stored) {
        throw new Error(`Failed to store completion message: ${insertError?.message ?? 'no data'}`)
      }

      return stored.id
    }

    // Normal plan-approval path — show plan chip to founder
    // Create the plan row first
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .insert({
        channel_id: channelId,
        bot_role_id: botRole.id,
        description_md: displayDescription,
        github_actions: actions as unknown as import('@/lib/supabase/types').Json,
        status: 'pending',
      })
      .select('id')
      .single()

    if (planError || !plan) {
      throw new Error(`Failed to create plan: ${planError?.message ?? 'no data'}`)
    }

    // Store bot message linked to the plan
    const { data: stored, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        author_type: 'bot',
        author_id: botRole.id,
        content: botMessage,
        plan_id: plan.id,
        ...(parentMessageId ? { parent_id: parentMessageId } : {}),
      })
      .select('id')
      .single()

    if (insertError || !stored) {
      throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
    }

    return stored.id
  }

  // 4b. Plain text reply — no GitHub action proposed
  const replyText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as Anthropic.TextBlock).text)
    .join('\n')
    .trim()

  if (!replyText) throw new Error('Claude returned an empty response')

  const { data: stored, error: insertError } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      author_type: 'bot',
      author_id: botRole.id,
      content: replyText,
      ...(parentMessageId ? { parent_id: parentMessageId } : {}),
    })
    .select('id')
    .single()

  if (insertError || !stored) {
    throw new Error(`Failed to store bot reply: ${insertError?.message ?? 'no data'}`)
  }

  return stored.id
}
