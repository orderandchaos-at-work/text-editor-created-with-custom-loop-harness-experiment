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
