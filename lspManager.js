const documentModel = require('./documentModel');
const { createLspClient } = require('./lspClient');
const { createDiagnosticStore } = require('./lspDiagnostics');

function splitArgs(value) {
  return value ? value.split(' ').filter(Boolean) : [];
}

function defaultLspConfigs(env = process.env) {
  const configs = {};
  if (env.TEXT_EDITOR_JS_LSP !== '0' && env.TEXT_EDITOR_JS_LSP !== 'false') {
    const command = env.TEXT_EDITOR_JS_LSP || 'typescript-language-server';
    configs.javascript = {
      command,
      args: env.TEXT_EDITOR_JS_LSP_ARGS ? splitArgs(env.TEXT_EDITOR_JS_LSP_ARGS) : command.includes('typescript-language-server') ? ['--stdio'] : [],
    };
  }
  if (env.TEXT_EDITOR_TS_LSP !== '0' && env.TEXT_EDITOR_TS_LSP !== 'false') {
    const command = env.TEXT_EDITOR_TS_LSP || 'typescript-language-server';
    const args = env.TEXT_EDITOR_TS_LSP_ARGS ? splitArgs(env.TEXT_EDITOR_TS_LSP_ARGS) : command.includes('typescript-language-server') ? ['--stdio'] : [];
    configs.typescript = { command, args };
    configs.typescriptreact = { command, args };
  }
  return configs;
}

function formatHoverContents(result, maxLength = 120) {
  if (!result || !result.contents) return null;
  const text = hoverContentsToText(result.contents).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function hoverContentsToText(contents) {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map(hoverContentsToText).filter(Boolean).join('\n');
  if (contents && typeof contents.value === 'string') return contents.value;
  return '';
}

function createLspManager(options = {}) {
  const configs = options.configs || {};
  const createClient = options.createClient || createLspClient;
  const diagnostics = options.diagnostics || createDiagnosticStore();
  const onDiagnostics = options.onDiagnostics || null;
  const clients = new Map();
  const starting = new Map();
  const failed = new Map();
  const openedUris = new Set();
  const status = new Map();

  function languageForBuffer(buffer) {
    return documentModel.languageIdForFilePath(buffer.filePath);
  }

  function configForBuffer(buffer) {
    return configs[languageForBuffer(buffer)] || null;
  }

  function isSupported(buffer) {
    return Boolean(configForBuffer(buffer));
  }

  async function startForBuffer(buffer) {
    const languageId = languageForBuffer(buffer);
    const config = configs[languageId];
    if (!config) return null;
    if (clients.has(languageId)) return clients.get(languageId);
    if (failed.has(languageId)) return null;
    if (starting.has(languageId)) return starting.get(languageId);

    const promise = Promise.resolve().then(async () => {
      const client = createClient(config);
      client.start();
      if (client.onNotification) {
        client.onNotification('textDocument/publishDiagnostics', params => {
          diagnostics.set(params.uri, params.diagnostics || [], params.version === undefined ? null : params.version);
          if (onDiagnostics) onDiagnostics(params);
        });
      }
      await client.initialize();
      if (client.initialized) client.initialized();
      clients.set(languageId, client);
      status.set(languageId, { available: true, error: null });
      return client;
    }).catch(error => {
      failed.set(languageId, error);
      status.set(languageId, { available: false, error: error.message || String(error) });
      return null;
    }).finally(() => {
      starting.delete(languageId);
    });

    starting.set(languageId, promise);
    return promise;
  }

  async function openBuffer(buffer) {
    if (!isSupported(buffer)) return false;
    const uri = documentModel.bufferUri(buffer);
    if (openedUris.has(uri)) return false;
    const client = await startForBuffer(buffer);
    if (!client) return false;
    if (openedUris.has(uri)) return false;
    client.didOpen(buffer);
    openedUris.add(uri);
    return true;
  }

  async function changeBuffer(buffer) {
    if (!isSupported(buffer)) return false;
    await openBuffer(buffer);
    const client = await startForBuffer(buffer);
    if (!client) return false;
    client.didChange(buffer);
    return true;
  }

  async function saveBuffer(buffer) {
    if (!isSupported(buffer)) return false;
    await openBuffer(buffer);
    const client = await startForBuffer(buffer);
    if (!client) return false;
    client.didSave(buffer);
    return true;
  }

  function diagnosticsForBuffer(buffer) {
    return diagnostics.get(documentModel.bufferUri(buffer));
  }

  function diagnosticSummary(buffer, row, col) {
    return diagnostics.summary(documentModel.bufferUri(buffer), row, col);
  }

  async function hover(buffer, row, col) {
    if (!isSupported(buffer)) return null;
    try {
      await openBuffer(buffer);
      const client = await startForBuffer(buffer);
      if (!client || !client.hover) return null;
      const result = await client.hover(documentModel.documentPositionParams(buffer, row, col));
      return formatHoverContents(result);
    } catch (_) {
      return null;
    }
  }

  async function shutdown() {
    const startedClients = Array.from(clients.values());
    await Promise.all(startedClients.map(client => {
      if (!client.shutdown) return Promise.resolve();
      return Promise.resolve(client.shutdown()).catch(() => null);
    }));
  }

  return {
    startForBuffer,
    openBuffer,
    changeBuffer,
    saveBuffer,
    hover,
    diagnosticsForBuffer,
    diagnosticSummary,
    shutdown,
    isSupported,
    status,
    diagnostics,
  };
}

module.exports = {
  createLspManager,
  defaultLspConfigs,
  formatHoverContents,
};
