const childProcess = require('child_process');
const documentModel = require('./documentModel');

function encodeMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function createMessageParser(onMessage) {
  let buffer = '';
  return chunk => {
    buffer += chunk.toString();
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = buffer.slice(bodyStart, bodyEnd);
      buffer = buffer.slice(bodyEnd);
      onMessage(JSON.parse(body));
    }
  };
}

function createLspClient(options = {}) {
  const spawn = options.spawn || childProcess.spawn;
  const command = options.command;
  const args = options.args || [];
  const cwd = options.cwd;
  const rootUri = options.rootUri || null;
  let transport = options.transport || null;
  let process = null;
  let nextId = 1;
  const pending = new Map();
  const received = [];
  const parseMessage = createMessageParser(message => {
    received.push(message);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(message.error);
      else resolve(message.result);
    }
  });

  function attachTransport(nextTransport) {
    transport = nextTransport;
    if (transport.stdout && transport.stdin) {
      transport.stdout.on('data', parseMessage);
    } else if (transport.on) {
      transport.on('data', parseMessage);
    }
  }

  function write(payload) {
    if (!transport) throw new Error('LSP client has not been started');
    const message = encodeMessage(payload);
    if (transport.stdin && transport.stdin.write) transport.stdin.write(message);
    else transport.write(message);
  }

  function start() {
    if (transport) {
      attachTransport(transport);
      return transport;
    }
    if (!command) throw new Error('LSP command is required');
    process = spawn(command, args, { cwd, stdio: 'pipe' });
    attachTransport(process);
    return process;
  }

  function request(method, params = {}) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    write({ jsonrpc: '2.0', id, method, params });
    return promise;
  }

  function notify(method, params = {}) {
    write({ jsonrpc: '2.0', method, params });
  }

  function initialize(params = {}) {
    return request('initialize', {
      processId: process ? process.pid : null,
      rootUri,
      capabilities: {},
      ...params,
    });
  }

  function didOpen(buffer) {
    const event = documentModel.documentOpenEvent(buffer);
    notify('textDocument/didOpen', {
      textDocument: {
        uri: event.uri,
        languageId: event.languageId,
        version: event.version,
        text: event.text,
      },
    });
  }

  function didChange(buffer) {
    const event = documentModel.documentChangeEvent(buffer);
    notify('textDocument/didChange', {
      textDocument: {
        uri: event.uri,
        version: event.version,
      },
      contentChanges: event.contentChanges,
    });
  }

  function didSave(buffer) {
    const event = documentModel.documentSaveEvent(buffer);
    notify('textDocument/didSave', {
      textDocument: {
        uri: event.uri,
      },
      text: event.text,
    });
  }

  async function shutdown() {
    const result = await request('shutdown');
    notify('exit');
    if (transport && transport.end) transport.end();
    else if (transport && transport.stdin && transport.stdin.end) transport.stdin.end();
    return result;
  }

  return {
    start,
    initialize,
    didOpen,
    didChange,
    didSave,
    shutdown,
    request,
    notify,
    received,
  };
}

module.exports = {
  createLspClient,
  encodeMessage,
  createMessageParser,
};
