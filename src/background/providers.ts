import Anthropic from '@anthropic-ai/sdk';

import type { ProviderId, RewriteErrorCode } from '@/core/ai';

/**
 * The AI providers the extension can talk to. Each has a fixed API origin, which is also the only place the
 * extension's CSP lets it connect to (see `PROVIDER_ORIGINS`). Requests go nowhere else.
 */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Exact origin of the API. Listed in the extension's CSP `connect-src`. */
  origin: string;
  /** Where to create an API key. */
  keysUrl: string;
  /** What keys look like, as a hint in the key field. */
  keyHint: string;
  /**
   * Whether the browser needs host permission to call the API. Providers that answer CORS preflights for extension
   * origins do not; Groq does not answer them, so the user grants access to its API origin when they choose it.
   */
  needsHostPermission: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    origin: 'https://api.groq.com',
    keysUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_…',
    needsHostPermission: true,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    origin: 'https://api.openai.com',
    keysUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    needsHostPermission: false,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    origin: 'https://api.anthropic.com',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    needsHostPermission: false,
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    origin: 'https://api.x.ai',
    keysUrl: 'https://console.x.ai',
    keyHint: 'xai-…',
    needsHostPermission: false,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    origin: 'https://generativelanguage.googleapis.com',
    keysUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    needsHostPermission: false,
  },
};

/** OpenAI-compatible base URLs. Anthropic has its own API and SDK. */
const OPENAI_COMPATIBLE_BASE: Record<Exclude<ProviderId, 'anthropic'>, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

const REQUEST_TIMEOUT_MS = 30_000;

/** A failure the user can act on. Carries a code, never the key or the provider's raw response. */
export class ProviderError extends Error {
  constructor(readonly code: RewriteErrorCode) {
    super(code);
    this.name = 'ProviderError';
  }
}

function errorForStatus(status: number, body: unknown): ProviderError {
  const text = JSON.stringify(body ?? '').toLowerCase();

  // Groq answers a blocked network (VPNs, datacenters) with 403 "Access denied. Please check your network settings."
  // before it looks at the key, so that must not read as a bad key.
  if (status === 403 && /network settings|access denied/.test(text)) {
    return new ProviderError('blocked');
  }

  if (status === 401 || status === 403) {
    return new ProviderError('auth');
  }

  if (status === 429) {
    return new ProviderError(text.includes('quota') || text.includes('billing') ? 'quota' : 'rate-limited');
  }

  if (status === 402) {
    return new ProviderError('quota');
  }

  if (status === 404) {
    return new ProviderError('model');
  }

  // Gemini reports a bad key as 400 INVALID_ARGUMENT "API key not valid".
  if (status === 400 && text.includes('api key')) {
    return new ProviderError('auth');
  }

  return new ProviderError('provider');
}

function networkError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  return new ProviderError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network');
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      // Never send cookies or other credentials of the API's origin, and never follow a redirect off it.
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw networkError(error);
  }

  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    // Some error responses are not JSON. The status code still tells us what happened.
  }

  if (!response.ok) {
    throw errorForStatus(response.status, body);
  }

  return body;
}

/** Leaves out models that cannot chat: embeddings, speech, images, moderation and the like. */
const NON_CHAT_MODEL =
  /embed|whisper|tts|transcri|audio|speech|realtime|image|dall-e|vision-preview|moderation|guard|aqa|imagen|veo|search|instruct|davinci|babbage|computer-use|playai/i;

function cleanModelList(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => !NON_CHAT_MODEL.test(id)).sort((a, b) => a.localeCompare(b));
}

/** Preferred defaults, best first: quick, capable models suited to rewriting a short post. */
const PREFERRED_MODELS: Record<ProviderId, readonly RegExp[]> = {
  groq: [/^llama-3\.3-70b-versatile$/, /llama.*70b/i, /llama/i],
  openai: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/],
  // The newest Opus, per Anthropic's guidance; Haiku and the others stay one pick away.
  anthropic: [/^claude-opus-5-5$/, /^claude-opus/, /^claude-sonnet/],
  xai: [/^grok-[\d.]+-fast/, /^grok-[\d.]+-mini/, /^grok/],
  gemini: [/^gemini-[\d.]+-flash$/, /flash/, /^gemini/],
};

export function pickDefaultModel(provider: ProviderId, models: readonly string[]): string | null {
  for (const pattern of PREFERRED_MODELS[provider]) {
    const match = models.find((id) => pattern.test(id));

    if (match !== undefined) {
      return match;
    }
  }

  return models[0] ?? null;
}

function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // The key belongs to the user and never leaves their browser except to Anthropic's API, which is the case this
    // flag exists for. The SDK runs only in the background service worker.
    dangerouslyAllowBrowser: true,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
}

function anthropicError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('auth');
  }

  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError('model');
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError('rate-limited');
  }

  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError('timeout');
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError('network');
  }

  if (error instanceof Anthropic.APIError) {
    // Billing problems come back as 400 with a credit message.
    return new ProviderError(/credit|billing/i.test(error.message) ? 'quota' : 'provider');
  }

  return networkError(error);
}

function idsFrom(body: unknown): string[] {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined;

  if (!Array.isArray(data)) {
    throw new ProviderError('bad-output');
  }

  return (
    data
      .map((entry: unknown) =>
        typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined,
      )
      .filter((id): id is string => typeof id === 'string')
      // Gemini lists its models as `models/<id>`; its chat endpoint takes the bare id.
      .map((id) => id.replace(/^models\//, ''))
  );
}

/** Lists the chat models the key can use. Doubles as the check that the key works. */
export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  if (provider === 'anthropic') {
    try {
      const ids: string[] = [];

      for await (const model of anthropicClient(apiKey).models.list()) {
        ids.push(model.id);
      }

      return cleanModelList(ids);
    } catch (error) {
      throw anthropicError(error);
    }
  }

  const body = await requestJson(`${OPENAI_COMPATIBLE_BASE[provider]}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return cleanModelList(idsFrom(body));
}

export interface CompletionRequest {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}

/** Models that take `output_config.effort` and the server-side refusal fallback. Older ones reject both. */
const ANTHROPIC_EFFORT_MODELS = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5|fable-5)/;
const ANTHROPIC_FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;

async function completeWithAnthropic({ apiKey, model, system, prompt }: CompletionRequest): Promise<string> {
  const fallback = ANTHROPIC_FALLBACK_MODELS.test(model);
  let response: Anthropic.Beta.BetaMessage;

  try {
    response = await anthropicClient(apiKey).beta.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
      // A short rewrite needs little deliberation, so keep it quick and cheap.
      ...(ANTHROPIC_EFFORT_MODELS.test(model) ? { output_config: { effort: 'low' as const } } : {}),
      // If the model declines on a safety classifier, let the API retry on a suitable fallback model in the same call.
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
  } catch (error) {
    throw anthropicError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new ProviderError('refused');
  }

  return response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function completeWithOpenAiCompatible({ provider, apiKey, model, system, prompt }: CompletionRequest) {
  if (provider === 'anthropic') {
    throw new ProviderError('provider');
  }

  const body = await requestJson(`${OPENAI_COMPATIBLE_BASE[provider]}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const choice = typeof body === 'object' && body !== null ? (body as { choices?: unknown }).choices : undefined;
  const first: unknown = Array.isArray(choice) ? choice[0] : undefined;
  const message = typeof first === 'object' && first !== null ? (first as { message?: unknown }).message : undefined;
  const content =
    typeof message === 'object' && message !== null ? (message as { content?: unknown }).content : undefined;
  const refusal =
    typeof message === 'object' && message !== null ? (message as { refusal?: unknown }).refusal : undefined;

  if (typeof refusal === 'string' && refusal !== '') {
    throw new ProviderError('refused');
  }

  if (typeof content !== 'string') {
    throw new ProviderError('bad-output');
  }

  return content;
}

/** Sends one prompt and returns the model's text. */
export function complete(request: CompletionRequest): Promise<string> {
  return request.provider === 'anthropic' ? completeWithAnthropic(request) : completeWithOpenAiCompatible(request);
}
