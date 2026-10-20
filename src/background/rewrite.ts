import type { RewriteErrorCode, RewriteMode, RewriteResult } from '@/core/ai';
import type { Settings } from '@/core/settings';

import { cleanRewrite, rewritePrompt, rewriteSystemPrompt } from './prompt';
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

  if (draft === '') {
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
    });
  } catch (error) {
    return fail(error instanceof ProviderError ? error.code : 'provider');
  }

  const text = cleanRewrite(output);

  if (text === null) {
    return fail('bad-output');
  }

  if (text.length > request.maxLength) {
    return fail('too-long');
  }

  return { ok: true, text };
}
