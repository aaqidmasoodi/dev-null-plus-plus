import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import './style.css';

import { listModels, pickDefaultModel, ProviderError, PROVIDERS } from '@/background/providers';
import {
  clearAiCredential,
  isApiKey,
  readAiCredential,
  writeAiCredential,
  type AiCredential,
} from '@/background/vault';
import {
  AI_STATUS_KEY,
  isProviderId,
  PROVIDER_IDS,
  REWRITE_ERROR_MESSAGES,
  type AiStatus,
  type ProviderId,
} from '@/core/ai';
import { dataConsentRequest, hasDataConsentApi } from '@/core/consent';
import { el } from '@/core/dom';
import { createLogger } from '@/core/logger';

/**
 * The AI provider form, framed into the /dev/null++ settings page on dev-null.sh. It is an extension page, so the
 * site's scripts cannot read what is typed into it. It checks the key with the provider, stores it in the vault and
 * mirrors only the provider and model, never the key, to `browser.storage.local` for the composer to see.
 */

const logger = createLogger('vault');
const params = new URLSearchParams(location.search);
const root = document.getElementById('vault');

document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');

interface State {
  credential: AiCredential | null;
  models: string[];
  provider: ProviderId;
  busy: boolean;
  error: string | null;
}

const state: State = {
  credential: null,
  models: [],
  provider: isProviderId(params.get('provider')) ? (params.get('provider') as ProviderId) : 'groq',
  busy: false,
  error: null,
};

function hostPermission(provider: ProviderId): string {
  return `${PROVIDERS[provider].origin}/*`;
}

function messageFor(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.code === 'auth'
      ? 'That key was rejected. Check it and try again.'
      : REWRITE_ERROR_MESSAGES[error.code];
  }

  logger.error('Unexpected error.', error);

  return 'Something went wrong. Try again.';
}

async function writeStatus(credential: AiCredential | null): Promise<void> {
  if (credential === null) {
    await browser.storage.local.remove(AI_STATUS_KEY);

    return;
  }

  const status: AiStatus = { provider: credential.provider, model: credential.model };

  await browser.storage.local.set({ [AI_STATUS_KEY]: status });
}

function maskKey(key: string): string {
  return key.length <= 8 ? '••••••••' : `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function row(label: string, field: Node): HTMLElement {
  return el('div', { className: 'row' }, [el('span', { className: 'label' }, [label]), field]);
}

function note(): HTMLElement {
  const provider = PROVIDERS[state.provider];

  if (state.error !== null) {
    return el('p', { className: 'note error', attrs: { role: 'alert' } }, [state.error]);
  }

  return el('p', { className: 'note' }, [
    el('a', { attrs: { href: provider.keysUrl, target: '_blank', rel: 'noopener noreferrer' } }, [
      `Get a ${provider.name} key ↗`,
    ]),
    '. It stays in this browser and is only ever sent to ',
    provider.name,
    '.',
  ]);
}

function busyLabel(label: string): (Node | string)[] {
  return state.busy ? [el('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }), label] : [label];
}

function renderDisconnected(): Node[] {
  const select = el('select', { attrs: { 'aria-label': 'Provider' } }, [
    ...PROVIDER_IDS.map((id) =>
      el('option', { attrs: { value: id, ...(id === state.provider ? { selected: '' } : {}) } }, [PROVIDERS[id].name]),
    ),
  ]);
  const key = el('input', {
    attrs: {
      type: 'password',
      'aria-label': 'API key',
      placeholder: PROVIDERS[state.provider].keyHint,
      autocomplete: 'off',
      spellcheck: 'false',
      autocapitalize: 'off',
    },
  });
  const connect = el('button', { className: 'primary', attrs: { type: 'button' } }, busyLabel('Connect'));

  select.disabled = state.busy;
  key.disabled = state.busy;
  connect.disabled = state.busy;
  select.addEventListener('change', () => {
    if (isProviderId(select.value)) {
      state.provider = select.value;
      state.error = null;
      render();
    }
  });
  connect.addEventListener('click', () => {
    void onConnect(key.value.trim());
  });
  key.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void onConnect(key.value.trim());
    }
  });

  return [
    row('provider', el('div', { className: 'field' }, [select])),
    row('key', el('div', { className: 'field' }, [key, connect])),
    row('', note()),
  ];
}

function renderConnected(credential: AiCredential): Node[] {
  const provider = PROVIDERS[credential.provider];
  const models = state.models.includes(credential.model) ? state.models : [credential.model, ...state.models];
  const select = el('select', { attrs: { 'aria-label': 'Model' } }, [
    ...models.map((id) =>
      el('option', { attrs: { value: id, ...(id === credential.model ? { selected: '' } : {}) } }, [id]),
    ),
  ]);
  const disconnect = el('button', { className: 'ghost', attrs: { type: 'button' } }, ['Disconnect']);

  select.disabled = state.busy;
  disconnect.disabled = state.busy;
  select.addEventListener('change', () => {
    void onModelChange(credential, select.value);
  });
  disconnect.addEventListener('click', () => {
    void onDisconnect(credential);
  });

  const status =
    state.error === null
      ? el('span', { className: 'status' }, [
          el('span', { className: 'dot', attrs: { 'aria-hidden': 'true' } }),
          `Connected to ${provider.name}`,
        ])
      : el('span', { className: 'status note error', attrs: { role: 'alert' } }, [state.error]);

  return [
    row('provider', el('div', { className: 'field' }, [status, disconnect])),
    row('model', el('div', { className: 'field' }, [select])),
    row('key', el('span', { className: 'mono' }, [maskKey(credential.apiKey)])),
  ];
}

function render(): void {
  root?.replaceChildren(...(state.credential === null ? renderDisconnected() : renderConnected(state.credential)));
}

async function onConnect(apiKey: string): Promise<void> {
  if (state.busy) {
    return;
  }

  const provider = state.provider;

  if (!isApiKey(apiKey)) {
    state.error = 'Paste an API key first.';
    render();

    return;
  }

  // Asking for permission has to happen straight away, while the click still counts as the user's own action. Firefox
  // also asks, in the same request, for leave to send drafts to the provider when a rewrite is asked for.
  const request = {
    ...(PROVIDERS[provider].needsHostPermission ? { origins: [hostPermission(provider)] } : {}),
    ...dataConsentRequest(),
  };
  const permission = Object.keys(request).length > 0 ? browser.permissions.request(request) : Promise.resolve(true);

  state.busy = true;
  state.error = null;
  render();

  try {
    let granted: boolean;

    try {
      granted = await permission;
    } catch (error) {
      // Some browsers do not ask for permissions from inside a frame. A full tab always can.
      logger.warn('Could not request permission in the frame.', error);
      void browser.tabs.create({ url: `${browser.runtime.getURL('/vault.html')}?provider=${provider}` });
      state.error = `Continue in the tab that just opened to give ${PROVIDERS[provider].name} access.`;

      return;
    }

    if (!granted) {
      state.error = hasDataConsentApi()
        ? `To connect ${PROVIDERS[provider].name}, allow /dev/null++ to send it your drafts when you ask for a rewrite.`
        : `${PROVIDERS[provider].name} needs access to ${PROVIDERS[provider].origin} to work.`;

      return;
    }

    const models = await listModels(provider, apiKey);
    const model = pickDefaultModel(provider, models);

    if (model === null) {
      state.error = 'This key has no chat models available.';

      return;
    }

    const credential: AiCredential = { provider, apiKey, model };

    await writeAiCredential(credential);
    await writeStatus(credential);
    state.credential = credential;
    state.models = models;
  } catch (error) {
    state.error = messageFor(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function onModelChange(credential: AiCredential, model: string): Promise<void> {
  if (!state.models.includes(model)) {
    return;
  }

  const updated: AiCredential = { ...credential, model };

  state.busy = true;
  render();

  try {
    await writeAiCredential(updated);
    await writeStatus(updated);
    state.credential = updated;
    state.error = null;
  } catch (error) {
    state.error = messageFor(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function onDisconnect(credential: AiCredential): Promise<void> {
  state.busy = true;
  render();

  try {
    await clearAiCredential();
    await writeStatus(null);

    // Give back access the provider no longer needs.
    if (PROVIDERS[credential.provider].needsHostPermission) {
      await browser.permissions.remove({ origins: [hostPermission(credential.provider)] });
    }

    // And, in Firefox, the leave to send drafts anywhere.
    if (hasDataConsentApi()) {
      await browser.permissions.remove(dataConsentRequest());
    }

    state.credential = null;
    state.models = [];
    state.provider = credential.provider;
    state.error = null;
  } catch (error) {
    state.error = messageFor(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function start(): Promise<void> {
  render();

  const credential = await readAiCredential();

  // Keep the composer's view in step with the vault, in case either changed without the other.
  await writeStatus(credential);
  state.credential = credential;

  if (credential === null) {
    render();

    return;
  }

  state.provider = credential.provider;
  state.models = [credential.model];
  render();

  try {
    state.models = await listModels(credential.provider, credential.apiKey);
  } catch (error) {
    state.error = messageFor(error);
  }

  render();
}

void start();
