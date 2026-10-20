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
 * Prefixes every line with the extension and scope, so our output is easy to filter in a busy page console. Debug lines
 * are dropped from production builds.
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${EXTENSION_NAME}:${scope}]`;
  const write = (level: Level, args: unknown[]): void => {
    if (level === 'debug' && !import.meta.env.DEV) {
      return;
    }

    console[level](prefix, ...args);
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
