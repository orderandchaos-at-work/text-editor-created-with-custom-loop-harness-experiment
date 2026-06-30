const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const { loadFile, saveFile, resolveSaveAsPath, saveAsFile } = require('./editorCore');
const documentModel = require('./documentModel');
const { createLspClient, encodeMessage, createMessageParser } = require('./lspClient');
const { createDiagnosticStore, severityLabel } = require('./lspDiagnostics');
const { createLspManager, defaultLspConfigs, formatHoverContents } = require('./lspManager');
const syntaxService = require('./syntaxService');
const {
  createEditorState,
  clampCursor,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  insertText,
  insertNewline,
  backspace,
  deleteForward,
  findSearchMatches,
  updateSearchMatches,
  moveToSearchMatch,
  nextSearchIndex,
  previousSearchIndex,
  replaceCurrent,
  replaceAll,
} = require('./editorState');

describe('editor core file helpers', () => {
  test('loads an existing file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const filePath = path.join(tmpDir, 'sample.txt');
    const content = 'hello\nworld';

    fs.writeFileSync(filePath, content, 'utf8');

    expect(loadFile(filePath)).toEqual(['hello', 'world']);
  });

  test('saves into nested directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const filePath = path.join(tmpDir, 'nested', 'save.txt');

    expect(saveFile(filePath, ['saved'])).toBe(true);

    expect(fs.readFileSync(filePath, 'utf8')).toBe('saved');
  });

  test('save-as resolves relative paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));

    expect(resolveSaveAsPath(path.join('nested', 'save.txt'), tmpDir)).toBe(path.join(tmpDir, 'nested', 'save.txt'));
  });

  test('save-as saves to resolved relative paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const resolved = saveAsFile(path.join('nested', 'save.txt'), ['hello', 'world'], tmpDir);

    expect(resolved).toBe(path.join(tmpDir, 'nested', 'save.txt'));
    expect(fs.readFileSync(resolved, 'utf8')).toBe('hello\nworld');
  });

  test('save-as returns false for blank paths', () => {
    expect(resolveSaveAsPath('')).toBe(false);
    expect(saveAsFile('', ['content'])).toBe(false);
  });
});

describe('syntax service', () => {
  test('detects JavaScript files', () => {
    expect(syntaxService.detectLanguage('/tmp/example.js')).toBe('javascript');
    expect(syntaxService.detectLanguage('/tmp/example.mjs')).toBe('javascript');
    expect(syntaxService.detectLanguage('/tmp/example.txt')).toBe(null);
  });

  test('converts editor lines to parser text', () => {
    expect(syntaxService.linesToText(['const a = 1;', 'a;'])).toBe('const a = 1;\na;');
  });

  const testWithTreeSitter = syntaxService.isTreeSitterAvailable() ? test : test.skip;

  testWithTreeSitter('parses JavaScript and reports syntax errors', () => {
    const valid = syntaxService.parse(['function hello() {', '  return 1;', '}'], '/tmp/example.js');
    const invalid = syntaxService.parse(['function broken( {'], '/tmp/example.js');

    expect(valid.supported).toBe(true);
    expect(valid.available).toBe(true);
    expect(valid.tree.rootNode.type).toBe('program');
    expect(valid.errors).toEqual([]);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  testWithTreeSitter('finds JavaScript syntax highlights and tree query matches', () => {
    const lines = ['function hello() {', '  return add(1, 2);', '}'];
    const highlights = syntaxService.highlight(lines, '/tmp/example.js');
    const result = syntaxService.treeSearch(lines, '/tmp/example.js', '(function_declaration name: (identifier) @function.name)');

    expect(highlights.some(span => span.capture === 'keyword')).toBe(true);
    expect(result.error).toBe(null);
    expect(result.matches).toEqual([
      expect.objectContaining({ capture: 'function.name', row: 0, text: 'hello' }),
    ]);
  });

  testWithTreeSitter('captures representative JavaScript syntax highlights', () => {
    const lines = [
      'import fs from "fs";',
      'export const VALUE = 42;',
      'class Greeter {',
      '  say() { return helper(this.name)?.trim() ?? `hi ${VALUE}`; }',
      '}',
      '// done',
    ];
    const highlights = syntaxService.highlight(lines, '/tmp/example.js');

    expect(highlights).toEqual(expect.arrayContaining([
      expect.objectContaining({ capture: 'keyword', text: 'import' }),
      expect.objectContaining({ capture: 'keyword', text: 'export' }),
      expect.objectContaining({ capture: 'constructor', text: 'Greeter' }),
      expect.objectContaining({ capture: 'function.method', text: 'say' }),
      expect.objectContaining({ capture: 'function.call', text: 'helper' }),
      expect.objectContaining({ capture: 'property', text: 'name' }),
      expect.objectContaining({ capture: 'string', text: '"fs"' }),
      expect.objectContaining({ capture: 'string', text: '`hi ${VALUE}`' }),
      expect.objectContaining({ capture: 'number', text: '42' }),
      expect.objectContaining({ capture: 'comment', text: '// done' }),
      expect.objectContaining({ capture: 'constant', text: 'VALUE' }),
      expect.objectContaining({ capture: 'operator', text: '??' }),
    ]));
  });

  testWithTreeSitter('bad highlight queries return no highlights without invalidating syntax state', () => {
    const state = syntaxService.parse(['const value = 1;'], '/tmp/example.js');

    expect(syntaxService.collectHighlights(state.language, state.tree, '(')).toEqual([]);
    expect(state.available).toBe(true);
  });

  testWithTreeSitter('caches JavaScript syntax state for a buffer', () => {
    const state = syntaxService.updateBuffer('js-buffer', ['const answer = 42;'], '/tmp/example.js', 1);

    expect(state).toEqual(expect.objectContaining({
      supported: true,
      available: true,
      languageName: 'javascript',
      version: 1,
      errors: [],
      queryMatches: [],
    }));
    expect(state.parser).toBeTruthy();
    expect(state.tree.rootNode.type).toBe('program');
    expect(state.highlights.some(span => span.capture === 'keyword')).toBe(true);
    expect(syntaxService.getBufferState('js-buffer')).toBe(state);
  });

  testWithTreeSitter('refreshes cached syntax state after text changes', () => {
    const first = syntaxService.updateBuffer('changing-buffer', ['function broken( {'], '/tmp/example.js', 1);
    const second = syntaxService.updateBuffer('changing-buffer', ['function fixed() {', '  return 1;', '}'], '/tmp/example.js', 2);

    expect(first.version).toBe(1);
    expect(first.errors.length).toBeGreaterThan(0);
    expect(second.version).toBe(2);
    expect(second.errors).toEqual([]);
    expect(syntaxService.getBufferState('changing-buffer')).toBe(second);
  });

  testWithTreeSitter('returns no syntax state for unsupported files', () => {
    const state = syntaxService.updateBuffer('text-buffer', ['plain text'], '/tmp/example.txt', 1);

    expect(state.supported).toBe(false);
    expect(state.available).toBe(false);
    expect(state.tree).toBe(null);
    expect(syntaxService.getBufferState('text-buffer')).toBe(null);
  });

  testWithTreeSitter('stores query matches on cached syntax state', () => {
    syntaxService.updateBuffer('query-buffer', ['function hello() {', '  return 1;', '}'], '/tmp/example.js', 1);
    const result = syntaxService.treeSearchBuffer('query-buffer', '(function_declaration name: (identifier) @function.name)');

    expect(result.error).toBe(null);
    expect(result.matches).toEqual([
      expect.objectContaining({ capture: 'function.name', row: 0, text: 'hello' }),
    ]);
    expect(syntaxService.getBufferState('query-buffer').queryMatches).toBe(result.matches);
  });

  testWithTreeSitter('keeps raw tree query search working', () => {
    syntaxService.updateBuffer('raw-query-buffer', ['function hello() {', '  return 1;', '}'], '/tmp/example.js', 1);
    const result = syntaxService.treeSearchBuffer('raw-query-buffer', '(function_declaration name: (identifier) @function.name)');

    expect(result.error).toBe(null);
    expect(result.preset).toBe(null);
    expect(result.matches).toEqual([
      expect.objectContaining({ capture: 'function.name', text: 'hello' }),
    ]);
  });

  testWithTreeSitter('supports friendly AST search presets', () => {
    const lines = [
      'import fs from "fs";',
      'class Greeter { say() { return add(1, 2); } }',
      'const helper = () => greet();',
      'let count = 1;',
    ];
    syntaxService.updateBuffer('preset-buffer', lines, '/tmp/example.js', 1);

    const functions = syntaxService.treeSearchBuffer('preset-buffer', 'functions');
    const classes = syntaxService.treeSearchBuffer('preset-buffer', 'classes');
    const imports = syntaxService.treeSearchBuffer('preset-buffer', 'imports');
    const calls = syntaxService.treeSearchBuffer('preset-buffer', 'calls');
    const variables = syntaxService.treeSearchBuffer('preset-buffer', 'variables');

    expect(functions.error).toBe(null);
    expect(functions.matches.some(match => match.text === 'say')).toBe(true);
    expect(functions.matches.some(match => match.text === 'helper')).toBe(true);
    expect(classes.matches).toEqual([expect.objectContaining({ capture: 'class.name', text: 'Greeter' })]);
    expect(imports.matches).toEqual([expect.objectContaining({ capture: 'import' })]);
    expect(calls.matches.map(match => match.text)).toEqual(expect.arrayContaining(['add', 'greet']));
    expect(variables.matches.map(match => match.text)).toEqual(expect.arrayContaining(['helper', 'count']));
  });

  testWithTreeSitter('supports named call AST search presets', () => {
    syntaxService.updateBuffer('call-preset-buffer', ['foo();', 'bar();', 'obj.foo();'], '/tmp/example.js', 1);
    const result = syntaxService.treeSearchBuffer('call-preset-buffer', 'calls:foo');

    expect(result.error).toBe(null);
    expect(result.preset).toBe('calls');
    expect(result.matches.map(match => match.text)).toEqual(['foo', 'foo']);
  });

  testWithTreeSitter('supports syntax error AST search preset', () => {
    syntaxService.updateBuffer('syntax-error-preset-buffer', ['function broken( {'], '/tmp/example.js', 1);
    const result = syntaxService.treeSearchBuffer('syntax-error-preset-buffer', 'syntax-errors');

    expect(result.error).toBe(null);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].capture).toBe('syntax.error');
  });

  testWithTreeSitter('reports preset and raw query errors cleanly', () => {
    syntaxService.updateBuffer('error-query-buffer', ['foo();'], '/tmp/example.js', 1);
    const invalidPreset = syntaxService.treeSearchBuffer('error-query-buffer', 'calls:');
    const invalidRawQuery = syntaxService.treeSearchBuffer('error-query-buffer', '(');

    expect(invalidPreset.matches).toEqual([]);
    expect(invalidPreset.error).toBe('Invalid AST preset: calls:<name> requires a name');
    expect(invalidRawQuery.matches).toEqual([]);
    expect(invalidRawQuery.error).toEqual(expect.any(String));
  });

  testWithTreeSitter('keeps syntax cache isolated across multiple buffers', () => {
    const first = syntaxService.updateBuffer('multi-buffer-a', ['function alpha() {', '  return 1;', '}'], '/tmp/alpha.js', 1);
    const second = syntaxService.updateBuffer('multi-buffer-b', ['class Beta {}'], '/tmp/beta.js', 1);

    const firstResult = syntaxService.treeSearchBuffer('multi-buffer-a', 'functions');
    const secondResult = syntaxService.treeSearchBuffer('multi-buffer-b', 'classes');

    expect(firstResult.matches).toEqual([expect.objectContaining({ capture: 'function.name', text: 'alpha' })]);
    expect(secondResult.matches).toEqual([expect.objectContaining({ capture: 'class.name', text: 'Beta' })]);
    expect(syntaxService.getBufferState('multi-buffer-a')).toEqual(expect.objectContaining({
      bufferId: 'multi-buffer-a',
      version: 1,
      tree: first.tree,
      queryMatches: firstResult.matches,
    }));
    expect(syntaxService.getBufferState('multi-buffer-b')).toEqual(expect.objectContaining({
      bufferId: 'multi-buffer-b',
      version: 1,
      tree: second.tree,
      queryMatches: secondResult.matches,
    }));
  });

  testWithTreeSitter('refreshing one buffer does not replace another buffer syntax state', () => {
    const stable = syntaxService.updateBuffer('stable-buffer', ['function stable() {}'], '/tmp/stable.js', 1);
    syntaxService.updateBuffer('edited-buffer', ['function broken( {'], '/tmp/edited.js', 1);
    const edited = syntaxService.updateBuffer('edited-buffer', ['function fixed() {}'], '/tmp/edited.js', 2);

    expect(syntaxService.getBufferState('stable-buffer')).toBe(stable);
    expect(syntaxService.getBufferState('stable-buffer').version).toBe(1);
    expect(syntaxService.getBufferState('stable-buffer').errors).toEqual([]);
    expect(syntaxService.getBufferState('edited-buffer')).toBe(edited);
    expect(edited.version).toBe(2);
    expect(edited.errors).toEqual([]);
  });

  testWithTreeSitter('clears only the requested buffer syntax state', () => {
    syntaxService.updateBuffer('clear-buffer-a', ['const a = 1;'], '/tmp/a.js', 1);
    syntaxService.updateBuffer('clear-buffer-b', ['const b = 2;'], '/tmp/b.js', 1);

    syntaxService.clearBuffer('clear-buffer-a');

    expect(syntaxService.getBufferState('clear-buffer-a')).toBe(null);
    expect(syntaxService.getBufferState('clear-buffer-b')).toEqual(expect.objectContaining({ bufferId: 'clear-buffer-b' }));
  });
});

describe('multi-buffer editor state behavior', () => {
  test('keeps cursor position and dirty state independent per buffer', () => {
    const buffers = [createEditorState(['first']), createEditorState(['second'])];
    let activeIndex = 0;

    buffers[activeIndex].cursorCol = 5;
    insertText(buffers[activeIndex], '!');
    activeIndex = 1;
    buffers[activeIndex].cursorRow = 0;
    buffers[activeIndex].cursorCol = 0;
    moveRight(buffers[activeIndex]);
    activeIndex = 0;

    expect(buffers[0].lines).toEqual(['first!']);
    expect(buffers[0].cursorCol).toBe(6);
    expect(buffers[0].dirty).toBe(true);
    expect(buffers[1].lines).toEqual(['second']);
    expect(buffers[1].cursorCol).toBe(1);
    expect(buffers[1].dirty).toBe(false);
  });

  test('saving one dirty buffer does not clear another buffer dirty state', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const first = createEditorState(['first changed']);
    const second = createEditorState(['second changed']);
    first.dirty = true;
    second.dirty = true;

    expect(saveFile(path.join(tmpDir, 'first.txt'), first.lines)).toBe(true);
    first.dirty = false;

    expect(first.dirty).toBe(false);
    expect(second.dirty).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'first.txt'), 'utf8')).toBe('first changed');
  });
});

describe('document model', () => {
  test('creates a document with one unnamed buffer by default', () => {
    const document = documentModel.createDocument();

    expect(document.buffers).toEqual([
      expect.objectContaining({ id: 1, filePath: null, lines: [''], dirty: false, version: 0 }),
    ]);
    expect(documentModel.activeBuffer(document)).toBe(document.buffers[0]);
  });

  test('loads initial paths and switches active buffers', () => {
    const document = documentModel.createDocument(['/tmp/a.txt', '/tmp/b.txt'], filePath => [path.basename(filePath)]);

    expect(document.buffers.map(buffer => buffer.lines)).toEqual([['a.txt'], ['b.txt']]);
    expect(documentModel.switchBuffer(document, 1)).toBe(document.buffers[1]);
    expect(documentModel.switchBuffer(document, 1)).toBe(document.buffers[0]);
    expect(documentModel.switchBuffer(document, -1)).toBe(document.buffers[1]);
  });

  test('adds buffers and finds them by path', () => {
    const document = documentModel.createDocument();
    const added = documentModel.addBuffer(document, '/tmp/new.txt', ['new']);

    expect(added).toEqual(expect.objectContaining({ id: 2, filePath: '/tmp/new.txt', lines: ['new'] }));
    expect(documentModel.activeBuffer(document)).toBe(added);
    expect(documentModel.findBufferIndex(document, '/tmp/new.txt')).toBe(1);
    expect(documentModel.findBufferIndex(document, '/tmp/missing.txt')).toBe(-1);
  });

  test('tracks buffer dirty and version lifecycle', () => {
    const buffer = documentModel.createBuffer(1, '/tmp/example.txt', ['hello']);

    documentModel.markChanged(buffer);
    expect(buffer.dirty).toBe(true);
    expect(buffer.version).toBe(1);

    documentModel.markSaved(buffer);
    expect(buffer.dirty).toBe(false);
    expect(buffer.version).toBe(1);

    documentModel.setBufferFilePath(buffer, '/tmp/renamed.txt');
    expect(buffer.filePath).toBe('/tmp/renamed.txt');
    expect(buffer.version).toBe(2);
  });

  test('converts between line positions and text offsets', () => {
    const lines = ['abc', 'de', 'f'];

    expect(documentModel.linesToText(lines)).toBe('abc\nde\nf');
    expect(documentModel.positionToOffset(lines, 1, 1)).toBe(5);
    expect(documentModel.offsetToPosition(lines, 5)).toEqual({ row: 1, col: 1 });
    expect(documentModel.positionToOffset(lines, 99, 99)).toBe(8);
    expect(documentModel.offsetToPosition(lines, 99)).toEqual({ row: 2, col: 1 });
  });

  test('creates normalized document events with full text changes', () => {
    const buffer = documentModel.createBuffer(7, '/tmp/example.js', ['const a = 1;', 'a;']);
    documentModel.markChanged(buffer);

    expect(documentModel.documentOpenEvent(buffer)).toEqual(expect.objectContaining({
      type: 'documentOpen',
      bufferId: 7,
      uri: 'file:///tmp/example.js',
      languageId: 'javascript',
      version: 1,
      text: 'const a = 1;\na;',
    }));
    expect(documentModel.documentChangeEvent(buffer)).toEqual(expect.objectContaining({
      type: 'documentChange',
      reason: 'change',
      uri: 'file:///tmp/example.js',
      version: 1,
      contentChanges: [{ text: 'const a = 1;\na;' }],
    }));
    expect(documentModel.documentSaveEvent(buffer)).toEqual(expect.objectContaining({
      type: 'documentSave',
      uri: 'file:///tmp/example.js',
      text: 'const a = 1;\na;',
    }));
  });

  test('creates LSP text document position params', () => {
    const buffer = documentModel.createBuffer(7, '/tmp/example.js', ['const value = 1;']);

    expect(documentModel.documentPositionParams(buffer, 0, 6)).toEqual({
      textDocument: { uri: 'file:///tmp/example.js' },
      position: { line: 0, character: 6 },
    });
  });
});

describe('lsp diagnostics', () => {
  const firstUri = 'file:///tmp/first.js';
  const secondUri = 'file:///tmp/second.js';
  const errorDiagnostic = {
    range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
    severity: 1,
    message: 'broken',
  };
  const warningDiagnostic = {
    range: { start: { line: 2, character: 0 }, end: { line: 3, character: 4 } },
    severity: 2,
    message: 'unused',
  };

  test('stores, replaces, and clears diagnostics per URI', () => {
    const store = createDiagnosticStore();

    store.set(firstUri, [errorDiagnostic], 1);
    store.set(secondUri, [warningDiagnostic], 1);

    expect(store.get(firstUri)).toEqual([errorDiagnostic]);
    expect(store.get(secondUri)).toEqual([warningDiagnostic]);
    expect(store.count(firstUri)).toBe(1);

    store.set(firstUri, [warningDiagnostic], 2);
    expect(store.get(firstUri)).toEqual([warningDiagnostic]);
    expect(store.get(secondUri)).toEqual([warningDiagnostic]);

    store.set(firstUri, [], 3);
    expect(store.get(firstUri)).toEqual([]);
    expect(store.count(firstUri)).toBe(0);

    store.clear(secondUri);
    expect(store.get(secondUri)).toEqual([]);
  });

  test('finds diagnostics for lines and positions', () => {
    const store = createDiagnosticStore();
    store.set(firstUri, [errorDiagnostic, warningDiagnostic]);

    expect(store.forLine(firstUri, 1)).toEqual([errorDiagnostic]);
    expect(store.forLine(firstUri, 3)).toEqual([warningDiagnostic]);
    expect(store.forPosition(firstUri, 1, 4)).toEqual([errorDiagnostic]);
    expect(store.forPosition(firstUri, 1, 1)).toEqual([]);
    expect(store.forPosition(firstUri, 3, 2)).toEqual([warningDiagnostic]);
  });

  test('formats severity summaries and keeps buffers isolated', () => {
    const store = createDiagnosticStore();
    store.set(firstUri, [errorDiagnostic, warningDiagnostic]);
    store.set(secondUri, [{ ...warningDiagnostic, message: 'second file' }]);

    expect(severityLabel(1)).toBe('error');
    expect(severityLabel(2)).toBe('warning');
    expect(severityLabel(3)).toBe('info');
    expect(severityLabel(4)).toBe('hint');
    expect(severityLabel(undefined)).toBe('diagnostic');
    expect(store.summary(firstUri, 1, 3)).toBe('LSP error: broken');
    expect(store.summary(firstUri, 0, 0)).toBe('LSP 2 diagnostics');
    expect(store.summary(secondUri, 2, 1)).toBe('LSP warning: second file');
    expect(store.summary('file:///tmp/missing.js', 0, 0)).toBe('');
  });
});

describe('lsp client', () => {
  class FakeTransport extends EventEmitter {
    constructor(results = {}) {
      super();
      this.results = results;
      this.messages = [];
      this.ended = false;
      this.parse = createMessageParser(message => {
        this.messages.push(message);
        if (message.id !== undefined) {
          const result = Object.prototype.hasOwnProperty.call(this.results, message.method) ? this.results[message.method] : message.method === 'initialize' ? { capabilities: { textDocumentSync: 1 } } : null;
          this.emit('data', encodeMessage({ jsonrpc: '2.0', id: message.id, result }));
        }
      });
    }

    write(message) {
      this.parse(Buffer.from(message));
    }

    end() {
      this.ended = true;
    }
  }

  test('initializes, sends full-document sync notifications, and shuts down', async () => {
    const transport = new FakeTransport();
    const client = createLspClient({ transport, rootUri: 'file:///tmp/project' });
    const buffer = documentModel.createBuffer(1, '/tmp/project/example.js', ['const a = 1;']);

    client.start();
    await expect(client.initialize()).resolves.toEqual({ capabilities: { textDocumentSync: 1 } });
    client.initialized();
    client.didOpen(buffer);
    buffer.lines = ['const a = 2;', 'a;'];
    documentModel.markChanged(buffer);
    client.didChange(buffer);
    client.didSave(buffer);
    await expect(client.shutdown()).resolves.toBe(null);

    expect(transport.messages.map(message => message.method)).toEqual([
      'initialize',
      'initialized',
      'textDocument/didOpen',
      'textDocument/didChange',
      'textDocument/didSave',
      'shutdown',
      'exit',
    ]);
    expect(transport.messages[0].params).toEqual(expect.objectContaining({
      processId: null,
      rootUri: 'file:///tmp/project',
      capabilities: {},
    }));
    expect(transport.messages[2].params.textDocument).toEqual({
      uri: 'file:///tmp/project/example.js',
      languageId: 'javascript',
      version: 0,
      text: 'const a = 1;',
    });
    expect(transport.messages[3].params).toEqual({
      textDocument: {
        uri: 'file:///tmp/project/example.js',
        version: 1,
      },
      contentChanges: [{ text: 'const a = 2;\na;' }],
    });
    expect(transport.messages[3].params.contentChanges[0].range).toBeUndefined();
    expect(transport.messages[4].params).toEqual({
      textDocument: { uri: 'file:///tmp/project/example.js' },
      text: 'const a = 2;\na;',
    });
    expect(transport.ended).toBe(true);
  });

  test('starts a configured server process over stdio', () => {
    const fakeProcess = {
      pid: 123,
      stdin: { write: jest.fn(), end: jest.fn() },
      stdout: new EventEmitter(),
    };
    const spawn = jest.fn(() => fakeProcess);
    const client = createLspClient({ command: 'language-server', args: ['--stdio'], cwd: '/tmp/project', spawn });

    expect(client.start()).toBe(fakeProcess);
    expect(spawn).toHaveBeenCalledWith('language-server', ['--stdio'], { cwd: '/tmp/project', stdio: 'pipe' });
  });

  test('rejects pending requests when the server process emits an error', async () => {
    const fakeProcess = Object.assign(new EventEmitter(), {
      pid: 123,
      stdin: { write: jest.fn(), end: jest.fn() },
      stdout: new EventEmitter(),
    });
    const spawn = jest.fn(() => fakeProcess);
    const client = createLspClient({ command: 'missing-server', spawn });

    client.start();
    const initialize = client.initialize();
    fakeProcess.emit('error', new Error('spawn missing-server ENOENT'));

    await expect(initialize).rejects.toThrow('spawn missing-server ENOENT');
  });

  test('dispatches server notifications to registered handlers', () => {
    const transport = new FakeTransport();
    const client = createLspClient({ transport });
    const handler = jest.fn();

    client.start();
    client.onNotification('textDocument/publishDiagnostics', handler);
    transport.emit('data', encodeMessage({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'file:///tmp/example.js',
        diagnostics: [{
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          severity: 1,
          message: 'broken',
        }],
      },
    }));

    expect(handler).toHaveBeenCalledWith({
      uri: 'file:///tmp/example.js',
      diagnostics: [expect.objectContaining({ message: 'broken' })],
    });
  });

  test('parses byte-length framed messages when multiple responses share a chunk', () => {
    const messages = [];
    const parse = createMessageParser(message => messages.push(message));
    const first = { jsonrpc: '2.0', method: 'one', params: { text: '🙂' } };
    const second = { jsonrpc: '2.0', method: 'two', params: { text: 'done' } };

    parse(Buffer.from(encodeMessage(first) + encodeMessage(second)));

    expect(messages).toEqual([first, second]);
  });

  test('sends hover requests and resolves hover responses', async () => {
    const hoverResult = { contents: { kind: 'markdown', value: 'const value: number' } };
    const transport = new FakeTransport({ 'textDocument/hover': hoverResult });
    const client = createLspClient({ transport });
    const params = {
      textDocument: { uri: 'file:///tmp/example.js' },
      position: { line: 0, character: 6 },
    };

    client.start();

    await expect(client.hover(params)).resolves.toEqual(hoverResult);
    expect(transport.messages[0]).toEqual(expect.objectContaining({
      method: 'textDocument/hover',
      params,
    }));
  });
});

describe('lsp manager', () => {
  function createFakeClient(handlers = {}) {
    return {
      start: jest.fn(),
      initialize: jest.fn(() => Promise.resolve({ capabilities: {} })),
      initialized: jest.fn(),
      didOpen: jest.fn(),
      didChange: jest.fn(),
      didSave: jest.fn(),
      hover: jest.fn(() => Promise.resolve({ contents: 'const value: number' })),
      shutdown: jest.fn(() => Promise.resolve()),
      onNotification: jest.fn((method, handler) => {
        handlers[method] = handler;
      }),
    };
  }

  test('uses local JavaScript LSP defaults and allows environment overrides', () => {
    expect(defaultLspConfigs({})).toEqual({
      javascript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
      },
    });
    expect(defaultLspConfigs({ TEXT_EDITOR_JS_LSP: '0' })).toEqual({});
    expect(defaultLspConfigs({ TEXT_EDITOR_JS_LSP: 'false' })).toEqual({});
    expect(defaultLspConfigs({
      TEXT_EDITOR_JS_LSP: 'custom-language-server',
      TEXT_EDITOR_JS_LSP_ARGS: '--stdio --log-level 4',
    })).toEqual({
      javascript: {
        command: 'custom-language-server',
        args: ['--stdio', '--log-level', '4'],
      },
    });
  });

  test('does nothing for unsupported buffers or missing config', async () => {
    const createClient = jest.fn();
    const manager = createLspManager({ configs: {}, createClient });
    const buffer = documentModel.createBuffer(1, '/tmp/example.js', ['const a = 1;']);
    const textManager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient });
    const textBuffer = documentModel.createBuffer(2, '/tmp/example.txt', ['plain']);

    await expect(manager.openBuffer(buffer)).resolves.toBe(false);
    await expect(manager.changeBuffer(buffer)).resolves.toBe(false);
    await expect(manager.saveBuffer(buffer)).resolves.toBe(false);
    await expect(textManager.openBuffer(textBuffer)).resolves.toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  test('starts configured JavaScript client and deduplicates didOpen', async () => {
    const client = createFakeClient();
    const createClient = jest.fn(() => client);
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient });
    const buffer = documentModel.createBuffer(1, '/tmp/example.js', ['const a = 1;']);

    await expect(manager.openBuffer(buffer)).resolves.toBe(true);
    await expect(manager.openBuffer(buffer)).resolves.toBe(false);

    expect(createClient).toHaveBeenCalledWith({ command: 'js-lsp' });
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(client.initialize).toHaveBeenCalledTimes(1);
    expect(client.initialized).toHaveBeenCalledTimes(1);
    expect(client.didOpen).toHaveBeenCalledTimes(1);
    expect(client.didOpen).toHaveBeenCalledWith(buffer);
  });

  test('sends didChange after buffer version is incremented and sends didSave', async () => {
    const client = createFakeClient();
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => client });
    const buffer = documentModel.createBuffer(1, '/tmp/example.js', ['const a = 1;']);

    await manager.openBuffer(buffer);
    buffer.lines = ['const a = 2;'];
    documentModel.markChanged(buffer);
    await manager.changeBuffer(buffer);
    await manager.saveBuffer(buffer);

    expect(client.didChange).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/tmp/example.js',
      version: 1,
      lines: ['const a = 2;'],
    }));
    expect(client.didSave).toHaveBeenCalledWith(buffer);
  });

  test('save-as opens the new URI and saves it', async () => {
    const client = createFakeClient();
    const openedUris = [];
    client.didOpen.mockImplementation(buffer => openedUris.push(documentModel.bufferUri(buffer)));
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => client });
    const buffer = documentModel.createBuffer(1, '/tmp/old.js', ['const a = 1;']);

    await manager.openBuffer(buffer);
    documentModel.setBufferFilePath(buffer, '/tmp/new.js');
    documentModel.markSaved(buffer);
    await manager.openBuffer(buffer);
    await manager.saveBuffer(buffer);

    expect(client.didOpen).toHaveBeenCalledTimes(2);
    expect(openedUris).toEqual(['file:///tmp/old.js', 'file:///tmp/new.js']);
    expect(client.didSave).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/tmp/new.js' }));
  });

  test('stores diagnostics by URI and keeps buffers isolated', async () => {
    const handlers = {};
    const client = createFakeClient(handlers);
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => client });
    const first = documentModel.createBuffer(1, '/tmp/first.js', ['first();']);
    const second = documentModel.createBuffer(2, '/tmp/second.js', ['second();']);

    await manager.openBuffer(first);
    await manager.openBuffer(second);
    handlers['textDocument/publishDiagnostics']({
      uri: 'file:///tmp/first.js',
      diagnostics: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        severity: 1,
        message: 'first broken',
      }],
    });
    handlers['textDocument/publishDiagnostics']({
      uri: 'file:///tmp/second.js',
      diagnostics: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        severity: 2,
        message: 'second warning',
      }],
    });

    expect(manager.diagnosticsForBuffer(first)).toEqual([expect.objectContaining({ message: 'first broken' })]);
    expect(manager.diagnosticsForBuffer(second)).toEqual([expect.objectContaining({ message: 'second warning' })]);
    expect(manager.diagnosticSummary(first, 0, 1)).toBe('LSP error: first broken');
    expect(manager.diagnosticSummary(second, 0, 1)).toBe('LSP warning: second warning');
  });

  test('handles startup failure without throwing and shuts down started clients', async () => {
    const failingClient = createFakeClient();
    failingClient.start.mockImplementation(() => { throw new Error('missing server'); });
    const failingManager = createLspManager({ configs: { javascript: { command: 'missing' } }, createClient: () => failingClient });
    const buffer = documentModel.createBuffer(1, '/tmp/example.js', ['const a = 1;']);

    await expect(failingManager.openBuffer(buffer)).resolves.toBe(false);
    expect(failingManager.status.get('javascript')).toEqual({ available: false, error: 'missing server' });

    const client = createFakeClient();
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => client });
    await manager.openBuffer(buffer);
    await expect(manager.shutdown()).resolves.toBeUndefined();
    expect(client.shutdown).toHaveBeenCalledTimes(1);
  });

  test('formats hover responses for status display', () => {
    expect(formatHoverContents(null)).toBe(null);
    expect(formatHoverContents({ contents: ' plain text ' })).toBe('plain text');
    expect(formatHoverContents({ contents: { kind: 'markdown', value: 'const value: number' } })).toBe('const value: number');
    expect(formatHoverContents({ contents: { language: 'javascript', value: 'let name: string' } })).toBe('let name: string');
    expect(formatHoverContents({ contents: [{ language: 'javascript', value: 'const a: number' }, 'docs'] })).toBe('const a: number docs');
    expect(formatHoverContents({ contents: 'line one\nline two' })).toBe('line one line two');
    expect(formatHoverContents({ contents: '1234567890' }, 6)).toBe('12345…');
  });

  test('requests hover for configured JavaScript buffers only', async () => {
    const client = createFakeClient();
    const manager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => client });
    const jsBuffer = documentModel.createBuffer(1, '/tmp/example.js', ['const value = 1;']);
    const textBuffer = documentModel.createBuffer(2, '/tmp/example.txt', ['plain']);

    await expect(manager.hover(textBuffer, 0, 1)).resolves.toBe(null);
    await expect(manager.hover(jsBuffer, 0, 6)).resolves.toBe('const value: number');

    expect(client.didOpen).toHaveBeenCalledWith(jsBuffer);
    expect(client.hover).toHaveBeenCalledWith({
      textDocument: { uri: 'file:///tmp/example.js' },
      position: { line: 0, character: 6 },
    });
  });

  test('returns null for hover when config is missing or request fails', async () => {
    const buffer = documentModel.createBuffer(1, '/tmp/example.js', ['const value = 1;']);
    const missingConfigManager = createLspManager({ configs: {}, createClient: jest.fn() });
    const failingClient = createFakeClient();
    failingClient.hover.mockRejectedValue(new Error('hover failed'));
    const failingManager = createLspManager({ configs: { javascript: { command: 'js-lsp' } }, createClient: () => failingClient });

    await expect(missingConfigManager.hover(buffer, 0, 6)).resolves.toBe(null);
    await expect(failingManager.hover(buffer, 0, 6)).resolves.toBe(null);
  });
});

describe('editor state editing helpers', () => {
  test('moves across line boundaries', () => {
    const state = createEditorState(['abc', 'de']);
    state.cursorRow = 0;
    state.cursorCol = 3;

    moveRight(state);

    expect(state.cursorRow).toBe(1);
    expect(state.cursorCol).toBe(0);

    moveLeft(state);

    expect(state.cursorRow).toBe(0);
    expect(state.cursorCol).toBe(3);
  });

  test('keeps cursor within shorter lines when moving vertically', () => {
    const state = createEditorState(['abcd', 'x']);
    state.cursorRow = 0;
    state.cursorCol = 4;

    moveDown(state);

    expect(state.cursorRow).toBe(1);
    expect(state.cursorCol).toBe(1);

    moveUp(state);

    expect(state.cursorRow).toBe(0);
    expect(state.cursorCol).toBe(1);
  });

  test('inserts text and newlines at the cursor', () => {
    const state = createEditorState(['hello']);
    state.cursorCol = 5;

    insertText(state, '!');
    insertNewline(state);
    insertText(state, 'world');

    expect(state.lines).toEqual(['hello!', 'world']);
    expect(state.cursorRow).toBe(1);
    expect(state.cursorCol).toBe(5);
    expect(state.dirty).toBe(true);
  });

  test('backspace deletes characters and joins lines', () => {
    const state = createEditorState(['hello', 'world']);
    state.cursorRow = 1;
    state.cursorCol = 0;

    backspace(state);

    expect(state.lines).toEqual(['helloworld']);
    expect(state.cursorRow).toBe(0);
    expect(state.cursorCol).toBe(5);

    backspace(state);

    expect(state.lines).toEqual(['hellworld']);
    expect(state.cursorCol).toBe(4);
  });

  test('delete removes characters and joins following lines', () => {
    const state = createEditorState(['abc', 'def']);
    state.cursorCol = 1;

    deleteForward(state);

    expect(state.lines).toEqual(['ac', 'def']);

    state.cursorCol = 2;
    deleteForward(state);

    expect(state.lines).toEqual(['acdef']);
    expect(state.dirty).toBe(true);
  });

  test('clamps cursor to valid document bounds', () => {
    const state = createEditorState(['abc']);
    state.cursorRow = 10;
    state.cursorCol = 10;

    clampCursor(state);

    expect(state.cursorRow).toBe(0);
    expect(state.cursorCol).toBe(3);
  });

  test('finds search matches and moves to the first match', () => {
    const state = createEditorState(['one two one', 'two one']);
    state.cursorRow = 1;
    state.cursorCol = 4;

    const result = updateSearchMatches(state, 'one');

    expect(result.matches).toEqual([{ row: 0, col: 0 }, { row: 0, col: 8 }, { row: 1, col: 4 }]);
    expect(result.index).toBe(2);
    expect(state.cursorRow).toBe(1);
    expect(state.cursorCol).toBe(4);
  });

  test('wraps search navigation forward and backward', () => {
    const state = createEditorState(['one two one']);
    const matches = findSearchMatches(state.lines, 'one');

    let index = nextSearchIndex(matches, 1);
    moveToSearchMatch(state, matches, index);

    expect(index).toBe(0);
    expect(state.cursorCol).toBe(0);

    index = previousSearchIndex(matches, index);
    moveToSearchMatch(state, matches, index);

    expect(index).toBe(1);
    expect(state.cursorCol).toBe(8);
  });

  test('replaces the current search match', () => {
    const state = createEditorState(['one two one']);
    const matches = findSearchMatches(state.lines, 'one');

    expect(replaceCurrent(state, matches, 1, 'one', 'three')).toBe(true);

    expect(state.lines).toEqual(['one two three']);
    expect(state.cursorRow).toBe(0);
    expect(state.cursorCol).toBe(13);
    expect(state.dirty).toBe(true);
  });

  test('replaces all matches and reports whether anything changed', () => {
    const state = createEditorState(['one two one', 'two']);

    expect(replaceAll(state, 'one', '1')).toBe(true);

    expect(state.lines).toEqual(['1 two 1', 'two']);
    expect(state.dirty).toBe(true);

    state.dirty = false;
    expect(replaceAll(state, 'missing', 'x')).toBe(false);
    expect(state.dirty).toBe(false);
  });
});
