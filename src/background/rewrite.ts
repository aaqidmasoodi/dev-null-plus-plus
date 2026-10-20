import { hasContent, type RewriteErrorCode, type RewriteMode, type RewriteResult } from '@/core/ai';
import type { Settings } from '@/core/settings';

import { parseRewriteOutput, REWRITE_OUTPUT_SCHEMA, rewritePrompt, rewriteSystemPrompt } from './prompt';
import { ProviderError, type CompletionRequest } from './providers';
import type { AiCredential } from './vault';

export interface RewriteRequest {
  text: string;
  mode: RewriteMode;
  instruction: string;
  maxLength: number;
}

export interface RewriteDependencies {
  readSettings: () => Promise<Settings>;
  readCredential: () => Promise<AiCredential | null>;
  complete: (request: CompletionRequest) => Promise<string>;
  limiter: RateLimiter;
}

/**
 * Caps how many rewrites can run in a short time, so a stuck button, a bug or a hostile page cannot run up the user's
 * provider bill.
 */
export class RateLimiter {
  readonly #times: number[] = [];

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    readonly now: () => number = () => Date.now(),
  ) {}

  /** Records an attempt and says whether it is allowed. */
  take(): boolean {
    const now = this.now();

    while (this.#times.length > 0 && now - (this.#times[0] ?? 0) >= this.windowMs) {
      this.#times.shift();
    }

    if (this.#times.length >= this.limit) {
      return false;
    }

    this.#times.push(now);

    return true;
  }
}

const fail = (error: RewriteErrorCode): RewriteResult => ({ ok: false, error });

/**
 * Rewrites a draft with the user's configured provider. The checks run in order of cost: settings, input, key, rate
 * limit, and only then the network. The key is read here and goes nowhere but the provider's API.
 */
export async function rewrite(request: RewriteRequest, dependencies: RewriteDependencies): Promise<RewriteResult> {
  const settings = await dependencies.readSettings();

  if (!settings.features.aiRewrite) {
    return fail('disabled');
  }

  const draft = request.text.trim();

  // Nothing with a letter or a digit in it never leaves the browser.
  if (!hasContent(draft)) {
    return fail('empty');
  }

  const credential = await dependencies.readCredential();

  if (credential === null) {
    return fail('not-configured');
  }

  if (!dependencies.limiter.take()) {
    return fail('rate-limited');
  }

  let output: string;

  try {
    output = await dependencies.complete({
      provider: credential.provider,
      apiKey: credential.apiKey,
      model: credential.model,
      system: rewriteSystemPrompt(request.maxLength),
      prompt: rewritePrompt(request.mode, draft, request.instruction),
      schema: REWRITE_OUTPUT_SCHEMA,
    });
  } catch (error) {
    return fail(error instanceof ProviderError ? error.code : 'provider');
  }

  const result = parseRewriteOutput(output);

  if (result === null) {
    return fail('bad-output');
  }

  if (result.status === 'unchanged') {
    return { ok: true, changed: false, reason: 'nothing' };
  }

  const text = result.text;

  if (text === draft) {
    return { ok: true, changed: false, reason: 'same' };
  }

  if (text.length > request.maxLength) {
    return fail('too-long');
  }

  // A rewrite is about the draft's length. One that balloons, outside of the user's own instructions, is the model
  // going off on its own, so it is rejected rather than pasted in.
  if (request.mode !== 'custom' && text.length > Math.max(draft.length * 3, draft.length + 280)) {
    return fail('bad-output');
  }

  return { ok: true, changed: true, text };
}
