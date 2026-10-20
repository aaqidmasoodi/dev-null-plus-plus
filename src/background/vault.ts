import { isModelId, isProviderId, type ProviderId } from '@/core/ai';

/**
 * Where the AI provider key lives: IndexedDB in the extension's own origin.
 *
 * Only the extension's own pages can open this database: the background service worker and the key-entry frame. Not
 * dev-null.sh, not its scripts, and not our content scripts either, since those run in the page's origin and share its
 * IndexedDB. That is a stronger boundary than `browser.storage`, which content scripts can read. See SECURITY.md.
 */

export interface AiCredential {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

const DATABASE = 'dnpp-vault';
const STORE = 'secrets';
const AI_KEY = 'ai';

/** API keys are opaque tokens. This only rules out values that cannot be one, like whitespace or markup. */
export function isApiKey(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7e]{8,512}$/.test(value);
}

function parseCredential(value: unknown): AiCredential | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { provider, apiKey, model } = value as Record<string, unknown>;

  return isProviderId(provider) && isApiKey(apiKey) && isModelId(model) ? { provider, apiKey, model } : null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open the vault.'));
    };
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));

      transaction.oncomplete = () => {
        resolve(request.result);
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Vault transaction failed.'));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error('Vault transaction aborted.'));
      };
    });
  } finally {
    database.close();
  }
}

export async function readAiCredential(): Promise<AiCredential | null> {
  return parseCredential(await transact('readonly', (store) => store.get(AI_KEY)));
}

export async function writeAiCredential(credential: AiCredential): Promise<void> {
  if (parseCredential(credential) === null) {
    throw new Error('Refusing to store an invalid credential.');
  }

  // Store a fresh object with exactly these fields, never whatever else the caller's object carries.
  const { provider, apiKey, model } = credential;

  await transact('readwrite', (store) => store.put({ provider, apiKey, model }, AI_KEY));
}

export async function clearAiCredential(): Promise<void> {
  await transact('readwrite', (store) => store.delete(AI_KEY));
}
