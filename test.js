const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadFile, saveFile, resolveSaveAsPath, saveAsFile } = require('./editorCore');
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
