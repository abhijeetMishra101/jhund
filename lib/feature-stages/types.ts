export type GateResult =
  | { cleared: true }
  | { cleared: false; reason: string; requiresFounder: boolean }

export type Complexity = 'hotfix' | 'small' | 'medium' | 'large'
export type FeatureStatus = 'active' | 'blocked' | 'shipped' | 'cancelled'
export type GateType = 'founder_approval' | 'auto_clear' | 'bot_signoff' | 'qa_sign_off'
