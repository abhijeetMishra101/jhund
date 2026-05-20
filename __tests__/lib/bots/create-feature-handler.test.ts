/**
 * Tests for the create_feature tool_use handler logic.
 *
 * UC-16B-15: create_feature handler inserts a feature row with correct fields
 * UC-16B-16: create_feature handler returns system message with feature title and ID
 * UC-16B-17: create_feature handler returns failure message when insert fails
 *
 * Strategy: test the handler logic in isolation (same pattern as tool-handler.test.ts).
 */
import { describe, it, expect, vi } from 'vitest'

// ── Inline implementation matching lib/bots/index.ts ─────────────────────────

interface CreateFeatureInput {
  title: string
  description: string
  complexity: 'hotfix' | 'small' | 'medium' | 'large'
}

interface InsertResult {
  data: { id: string } | null
  error: { message: string } | null
}

async function handleCreateFeatureTool(
  input: CreateFeatureInput,
  workspaceId: string,
  insertFn: (row: Record<string, unknown>) => Promise<InsertResult>
): Promise<string> {
  try {
    const { data: feature, error: featureError } = await insertFn({
      workspace_id: workspaceId,
      title: input.title.trim(),
      description: input.description.trim(),
      complexity: input.complexity,
      stage: 1,
      status: 'active',
    })

    if (featureError || !feature) {
      throw new Error(featureError?.message ?? 'Insert returned no data')
    }

    return `✓ Feature "${input.title}" created in Pipeline (Stage 1 — Idea). ID: ${feature.id}`
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Failed to create feature: ${message}`
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('create_feature tool handler', () => {
  it('UC-16B-15: calls insert with correct fields including workspace_id and stage 1', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: { id: 'feat-abc' }, error: null })
    const input: CreateFeatureInput = {
      title: 'Dark Mode',
      description: 'Allow users to switch to a dark colour scheme.',
      complexity: 'small',
    }

    await handleCreateFeatureTool(input, 'ws-xyz', insertFn)

    expect(insertFn).toHaveBeenCalledOnce()
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-xyz',
        title: 'Dark Mode',
        description: 'Allow users to switch to a dark colour scheme.',
        complexity: 'small',
        stage: 1,
        status: 'active',
      })
    )
  })

  it('UC-16B-16: success → message includes feature title and new ID', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: { id: 'feat-123' }, error: null })
    const input: CreateFeatureInput = {
      title: 'Dark Mode',
      description: 'Switch to dark colours.',
      complexity: 'small',
    }

    const result = await handleCreateFeatureTool(input, 'ws-xyz', insertFn)

    expect(result).toContain('Dark Mode')
    expect(result).toContain('feat-123')
    expect(result).toContain('Stage 1')
  })

  it('UC-16B-17: insert error → failure message with error text', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB constraint failed' } })
    const input: CreateFeatureInput = {
      title: 'Dark Mode',
      description: 'Switch to dark colours.',
      complexity: 'small',
    }

    const result = await handleCreateFeatureTool(input, 'ws-xyz', insertFn)

    expect(result).toMatch(/Failed to create feature/)
    expect(result).toContain('DB constraint failed')
  })

  it('insert returns null data and no error → "Insert returned no data" fallback', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const input: CreateFeatureInput = {
      title: 'Dark Mode',
      description: 'Switch to dark colours.',
      complexity: 'small',
    }

    const result = await handleCreateFeatureTool(input, 'ws-xyz', insertFn)

    expect(result).toContain('Failed to create feature')
    expect(result).toContain('Insert returned no data')
  })

  it('title and description are trimmed before insert', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: { id: 'feat-trim' }, error: null })
    const input: CreateFeatureInput = {
      title: '  Dark Mode  ',
      description: '  Adds dark theme.  ',
      complexity: 'hotfix',
    }

    await handleCreateFeatureTool(input, 'ws-xyz', insertFn)

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dark Mode',
        description: 'Adds dark theme.',
      })
    )
  })
})
