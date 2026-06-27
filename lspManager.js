const documentModel = require('./documentModel');
const { createLspClient } = require('./lspClient');
const { createDiagnosticStore } = require('./lspDiagnostics');

function defaultLspConfigs(env = process.env) {
  if (!env.TEXT_EDITOR_JS_LSP) return {};
  return {
    javascript: {
      command: env.TEXT_EDITOR_JS_LSP,
      args: env.TEXT_EDITOR_JS_LSP_ARGS ? env.TEXT_EDITOR_JS_LSP_ARGS.split(' ').filter(Boolean) : [],
    },
  };
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
};
