/**
 * What the content scripts and the background share about AI rewriting. Nothing secret lives here: the API key itself
 * is only ever read by the background and the key-entry frame. See SECURITY.md.
 */

/** The one-click presets, in the order the composer shows them. */
export const PRESET_MODES = ['improve', 'shorten', 'fix', 'casual', 'professional'] as const;

/** A preset, or `custom` for the user's own words, which travel in `instruction`. */
export const REWRITE_MODES = [...PRESET_MODES, 'custom'] as const;

export type PresetMode = (typeof PRESET_MODES)[number];

export type RewriteMode = (typeof REWRITE_MODES)[number];

export const PRESET_LABELS: Record<PresetMode, string> = {
  improve: 'Improve',
  shorten: 'Shorten',
  fix: 'Fix grammar',
  casual: 'Casual',
  professional: 'Professional',
};

export function isRewriteMode(value: unknown): value is RewriteMode {
  return typeof value === 'string' && (REWRITE_MODES as readonly string[]).includes(value);
}

/** How long the user's own rewrite instruction can be. Enough for "punchier, and mention the benchmark". */
export const MAX_INSTRUCTION_LENGTH = 200;

/**
 * A custom instruction is the user's own text, but it still goes into a prompt, so it must be a single short line:
 * no line breaks, nothing beyond the limit.
 */
export function isInstruction(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_INSTRUCTION_LENGTH && !/[\r\n]/.test(value);
}

export const PROVIDER_IDS = ['groq', 'openai', 'anthropic', 'xai', 'gemini'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** The longest draft the extension will send. dev-null.sh's own limit is 4,000; the textarea's is a little higher. */
export const MAX_DRAFT_LENGTH = 10_000;

/** Model ids are short tokens like `llama-3.3-70b-versatile` or `models/gemini-flash`. Anything else is rejected. */
export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w.:/-]{1,128}$/.test(value);
}

/**
 * Which provider and model are connected, mirrored into `browser.storage.local` so the composer knows whether to show
 * the AI button. Deliberately holds nothing secret.
 */
export interface AiStatus {
  provider: ProviderId;
  model: string;
}

export const AI_STATUS_KEY = 'aiStatus';

export function parseAiStatus(value: unknown): AiStatus | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { provider, model } = value as Record<string, unknown>;

  return isProviderId(provider) && isModelId(model) ? { provider, model } : null;
}

/** Why a rewrite failed, in terms the composer can explain. */
export type RewriteErrorCode =
  | 'disabled'
  | 'not-configured'
  | 'empty'
  | 'too-long'
  | 'rate-limited'
  | 'auth'
  | 'blocked'
  | 'quota'
  | 'model'
  | 'refused'
  | 'timeout'
  | 'network'
  | 'bad-output'
  | 'provider';

export type RewriteResult = { ok: true; text: string } | { ok: false; error: RewriteErrorCode };

const REWRITE_ERROR_CODES: readonly RewriteErrorCode[] = [
  'disabled',
  'not-configured',
  'empty',
  'too-long',
  'rate-limited',
  'auth',
  'blocked',
  'quota',
  'model',
  'refused',
  'timeout',
  'network',
  'bad-output',
  'provider',
];

/** Checks a reply from the background before the composer trusts it. Anything malformed counts as a provider error. */
export function parseRewriteResult(value: unknown): RewriteResult {
  if (typeof value === 'object' && value !== null) {
    const { ok, text, error } = value as Record<string, unknown>;

    if (ok === true && typeof text === 'string' && text !== '' && text.length <= MAX_DRAFT_LENGTH) {
      return { ok: true, text };
    }

    if (ok === false && REWRITE_ERROR_CODES.includes(error as RewriteErrorCode)) {
      return { ok: false, error: error as RewriteErrorCode };
    }
  }

  return { ok: false, error: 'provider' };
}

export const REWRITE_ERROR_MESSAGES: Record<RewriteErrorCode, string> = {
  disabled: 'Rewrite with AI is turned off in /dev/null++ settings.',
  'not-configured': 'Add an API key in /dev/null++ settings first.',
  empty: 'Write something first.',
  'too-long': 'The rewrite came out too long. Try Shorten.',
  'rate-limited': 'Too many rewrites in a row. Wait a moment and try again.',
  auth: 'The provider rejected your API key. Check it in /dev/null++ settings.',
  blocked:
    'The provider is refusing connections from your network, before checking the key. This often happens on a VPN: try turning it off, or use another provider.',
  quota: 'Your provider account is out of credit or quota.',
  model: 'The selected model is not available. Pick another in /dev/null++ settings.',
  refused: 'The model declined to rewrite this.',
  timeout: 'The provider took too long. Try again.',
  network: 'Could not reach the provider. Check your connection.',
  'bad-output': 'The provider sent back something unusable. Try again.',
  provider: 'The provider had a problem. Try again in a moment.',
};
