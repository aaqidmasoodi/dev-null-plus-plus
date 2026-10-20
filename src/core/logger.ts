/* eslint-disable no-console -- this module is the one place that is allowed to write to the console. */
import { EXTENSION_NAME } from './constants';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Shapes of credentials that must never reach a console: provider API keys and bearer tokens. Content script output
 * lands in the page's console, where the page and anyone looking over a shoulder can read it.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|xai|gsk|sk-ant|sk-proj)[-_][A-Za-z0-9_-]{12,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[redacted]'), text);
}

/**
 * Turns anything logged into redacted text. Errors keep their name and message but not their stack, and objects are
 * serialized first, so nothing reaches the console unchecked.
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redact(value);
  }

  if (value instanceof Error) {
    return `${value.name}: ${redact(value.message)}`;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  try {
    return redact(JSON.stringify(value));
  } catch {
    return '[unserializable]';
  }
}

/**
 * Prefixes every line with the extension and scope, so our output is easy to filter in a busy page console. Debug lines
 * are dropped from production builds, and everything is redacted.
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${EXTENSION_NAME}:${scope}]`;
  const write = (level: Level, args: unknown[]): void => {
    if (level === 'debug' && !import.meta.env.DEV) {
      return;
    }

    console[level](prefix, ...args.map(redactValue));
  };

  return {
    debug: (...args) => {
      write('debug', args);
    },
    info: (...args) => {
      write('info', args);
    },
    warn: (...args) => {
      write('warn', args);
    },
    error: (...args) => {
      write('error', args);
    },
  };
}
