import type Anthropic from '@anthropic-ai/sdk'

/** Proposes one or more GitHub actions for the founder to approve. */
export const PROPOSE_GITHUB_ACTION_TOOL: Anthropic.Tool = {
  name: 'propose_github_action',
  description:
    'Propose one or more GitHub actions for the founder to approve in a single click. ' +
    'Pass all steps as an ordered array — they execute in sequence after approval. ' +
    'To write a file and open a PR, include commit_file as the first action and create_pr as the second. ' +
    'Never take GitHub actions directly — always use this tool.',
  input_schema: {
    type: 'object' as const,
    properties: {
      plain_english_description: {
        type: 'string',
        description: 'Plain English summary of the full set of actions, shown to the founder for approval',
      },
      actions: {
        type: 'array',
        description: 'Ordered list of GitHub actions to execute in sequence after approval.',
        items: {
          type: 'object',
          properties: {
            action_type: {
              type: 'string',
              enum: ['commit_file', 'create_pr', 'create_issue', 'comment_pr', 'comment_issue'],
            },
            payload: {
              type: 'object',
              description:
                'Fields per action_type:\n' +
                '- commit_file: { file_path, content, commit_message, branch } — branch must be like "bot/describe-change"\n' +
                '- create_pr: { title, body, head_branch, base_branch } — head_branch must match the branch from commit_file\n' +
                '- create_issue: { title, body, labels[] }\n' +
                '- comment_pr: { pr_number, body }\n' +
                '- comment_issue: { issue_number, body }',
              properties: {
                file_path: { type: 'string' },
                content: { type: 'string' },
                commit_message: { type: 'string' },
                branch: { type: 'string' },
                head_branch: { type: 'string' },
                base_branch: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
                labels: { type: 'array', items: { type: 'string' } },
                pr_number: { type: 'integer' },
                issue_number: { type: 'integer' },
              },
            },
          },
          required: ['action_type', 'payload'],
        },
      },
    },
    required: ['plain_english_description', 'actions'],
  },
}

/** Creates a new feature in the Pipeline database. */
export const CREATE_FEATURE_TOOL: Anthropic.Tool = {
  name: 'create_feature',
  description:
    'Create a new feature in the product pipeline. ' +
    'Use this when the founder asks to log, track, add, or capture a feature idea. ' +
    'Do NOT use propose_github_action for this — the Pipeline is the source of truth for features.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Short, clear feature name (e.g. "Dark mode support")',
      },
      description: {
        type: 'string',
        description: 'One or two sentences on what this feature does and why it matters',
      },
      complexity: {
        type: 'string',
        enum: ['hotfix', 'small', 'medium', 'large'],
        description:
          'hotfix=bug fix no new surface, small=1 surface clear spec, medium=multi-surface, large=multi-team new architecture',
      },
    },
    required: ['title', 'description', 'complexity'],
  },
}

/** Signals that a feature is ready to move to the next pipeline stage. */
export const ADVANCE_FEATURE_STAGE_TOOL: Anthropic.Tool = {
  name: 'advance_feature_stage',
  description:
    "Signal that a feature is ready to move to the next stage of the pipeline. " +
    "Use this when you have completed your role's work on a feature and the gate conditions are met.",
  input_schema: {
    type: 'object' as const,
    properties: {
      feature_id: {
        type: 'string',
        description: 'The UUID of the feature to advance',
      },
      to_stage: {
        type: 'number',
        description: 'The stage number to advance to (2-7)',
      },
      gate_type: {
        type: 'string',
        enum: ['bot_signoff', 'founder_approval', 'auto_clear'],
        description: 'The type of gate being passed',
      },
      notes: {
        type: 'string',
        description: 'Plain-English explanation of why this feature is ready to advance',
      },
    },
    required: ['feature_id', 'to_stage', 'gate_type', 'notes'],
  },
}
