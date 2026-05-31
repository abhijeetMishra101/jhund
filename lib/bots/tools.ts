import type Anthropic from '@anthropic-ai/sdk'

/** Reads the current contents of a file from the connected GitHub repository. */
export const READ_GITHUB_FILE_TOOL: Anthropic.Tool = {
  name: 'read_github_file',
  description:
    'Read the current contents of a file from the connected GitHub repository. ' +
    'Call this BEFORE proposing any change to an existing file. ' +
    'You may call it multiple times in one response to read several files. ' +
    'Do NOT call this for files you are about to create from scratch.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to repo root, e.g. "src/m1/collector.py"',
      },
      branch: {
        type: 'string',
        description: 'Branch to read from. Omit to use the repo default branch.',
      },
    },
    required: ['path'],
  },
}

/** Lists the files and sub-folders in a directory of the connected GitHub repository. */
export const LIST_DIRECTORY_TOOL: Anthropic.Tool = {
  name: 'list_directory',
  description:
    'List the files and sub-folders in a directory of the connected GitHub repository. ' +
    'Use this to explore the codebase structure before deciding which files to read. ' +
    'Returns names, paths, and types (file or directory). ' +
    'Use "" (empty string) as the path to list the repo root.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to repo root. Use "" for the root. Examples: "lib/bots", "src/components"',
      },
      branch: {
        type: 'string',
        description: 'Branch to read from. Omit to use the repo default branch.',
      },
    },
    required: ['path'],
  },
}

/** Proposes one or more GitHub actions for the founder to approve. */
export const PROPOSE_GITHUB_ACTION_TOOL: Anthropic.Tool = {
  name: 'propose_github_action',
  description:
    'Propose one or more GitHub actions for the founder to approve in a single click. ' +
    'Pass all steps as an ordered array — they execute in sequence after approval. ' +
    'CRITICAL FILE EDITING RULES — read before choosing action_type:\n' +
    '  • commit_file    = CREATE a new file that does NOT exist yet\n' +
    '  • patch_github_file = EDIT a file that already exists (supply old_string + new_string)\n' +
    'NEVER use commit_file on an existing file — the server will reject it.\n' +
    'To create a file and open a PR: commit_file first, then create_pr.\n' +
    'To edit a file and open a PR: patch_github_file first, then create_pr.\n' +
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
              enum: ['commit_file', 'patch_github_file', 'create_pr', 'create_issue', 'comment_pr', 'comment_issue'],
            },
            payload: {
              type: 'object',
              description:
                'Fields per action_type:\n' +
                '- commit_file: { file_path, content, commit_message, branch } — NEW files only. Branch must be like "bot/describe-change". Do NOT use for editing existing files.\n' +
                '- patch_github_file: { file_path, old_string, new_string, branch, commit_message } — EDIT existing files. old_string must match exactly once in the file.\n' +
                '- create_pr: { title, body, head_branch, base_branch } — head_branch must match the branch from commit_file or patch_github_file\n' +
                '- create_issue: { title, body, labels[] }\n' +
                '- comment_pr: { pr_number, body }\n' +
                '- comment_issue: { issue_number, body }',
              properties: {
                file_path: { type: 'string' },
                content: { type: 'string' },
                old_string: { type: 'string' },
                new_string: { type: 'string' },
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
      confidence: {
        type: 'string',
        enum: ['auto', 'review'],
        description:
          '"auto" — low-risk change, can execute without founder approval. ' +
          'Only use "auto" when ALL of: (1) every action is commit_file or patch_github_file only, ' +
          '(2) every file path is in docs/, __tests__/, or matches *.test.ts/*.test.js/*.spec.ts/*.md, ' +
          '(3) branch starts with "bot/". ' +
          '"review" — default, requires founder approval.',
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

/** Records a decision made by the bot, with an optional action to auto-dispatch. */
export const RECORD_DECISION_TOOL: Anthropic.Tool = {
  name: 'record_decision',
  description:
    'Record a decision you have made, with an optional action to execute. ' +
    'Use this when you have reached a clear decision (not just analysis) — something scoped in or out, ' +
    'a priority set, an owner assigned, or a plan changed. ' +
    'If action is provided, it will be dispatched to #decisions for execution.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Short decision title (< 80 chars)',
      },
      summary: {
        type: 'string',
        description: 'Full decision rationale and context',
      },
      action: {
        type: 'string',
        description:
          'Optional: specific action to execute now (e.g. "Open a PR to add rate limiting to /api/messages")',
      },
    },
    required: ['title', 'summary'],
  },
}

/** Commits a structured Markdown summary of this discussion to the GitHub repo docs folder. */
export const DOCUMENT_DISCUSSION_TOOL: Anthropic.Tool = {
  name: 'document_discussion',
  description:
    'Save a written summary of this discussion for future reference. ' +
    'Use this after a substantive discussion to create a persistent record — ' +
    'decisions made, options considered, and next steps. ' +
    'If the workspace has a connected GitHub repo the summary will be saved there automatically.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Discussion title',
      },
      summary: {
        type: 'string',
        description: 'Full Markdown summary of the discussion',
      },
    },
    required: ['title', 'summary'],
  },
}

/** Retracts the most recent decision recorded in the current channel. */
export const UNDO_DECISION_TOOL: Anthropic.Tool = {
  name: 'undo_decision',
  description:
    'Retract the most recent decision you recorded in this channel. ' +
    "Use this when the founder says \"undo that decision\", \"that wasn't a decision\", " +
    '"delete that", or similar explicit retraction request. ' +
    'Do NOT use this unless the founder explicitly asks to undo.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}

/** Sends a message to another teammate bot and gets their reply inline. */
export const MESSAGE_TEAMMATE_TOOL: Anthropic.Tool = {
  name: 'message_teammate',
  description:
    'Send a message to another teammate and get their reply. ' +
    'Use this when you need input from a specific team member before continuing your work. ' +
    'The other bot will reply and you will receive their answer as the result. ' +
    'Do NOT use this to loop endlessly — one question, one answer, then continue.',
  input_schema: {
    type: 'object' as const,
    properties: {
      role: {
        type: 'string',
        enum: ['ops', 'product', 'backend', 'design', 'security', 'qa', 'ml'],
        description: 'The role of the teammate to message',
      },
      message: {
        type: 'string',
        description: 'The message to send — be specific about what you need',
      },
    },
    required: ['role', 'message'],
  },
}

/** Asks the founder for input when the bot is blocked and cannot continue. */
export const ESCALATE_TO_FOUNDER_TOOL: Anthropic.Tool = {
  name: 'escalate_to_founder',
  description:
    'Ask the founder a question when you are blocked and cannot continue without their input. ' +
    'Use this sparingly — only for genuine blockers, not routine updates. ' +
    'Your question will appear in the channel and the founder can reply directly to resume your work.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reason: {
        type: 'string',
        description: 'Why you are blocked — what you have tried and what is missing',
      },
      question: {
        type: 'string',
        description: 'The specific question the founder needs to answer',
      },
    },
    required: ['reason', 'question'],
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
        enum: ['bot_signoff', 'founder_approval', 'auto_clear', 'qa_sign_off'],
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
