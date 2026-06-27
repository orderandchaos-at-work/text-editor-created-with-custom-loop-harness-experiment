const path = require('path');
const readline = require('readline');
const { loadExistingFile, saveFile, saveAsFile } = require('./editorCore');
const editorState = require('./editorState');
const syntaxService = require('./syntaxService');

const initialFilePaths = process.argv.slice(2).map(file => path.resolve(process.cwd(), file));
let nextBufferId = 1;
let buffers = initialFilePaths.length ? initialFilePaths.map(createBuffer) : [createBuffer(null)];
let activeBufferIndex = 0;
let filePath = buffers[0].filePath;
let lines = buffers[0].lines;
let cursorRow = buffers[0].cursorRow;
let cursorCol = buffers[0].cursorCol;
let viewportRow = buffers[0].viewportRow;
let dirty = buffers[0].dirty;
let version = buffers[0].version;
let quitConfirm = false;
let searchQuery = '';
let searchMatches = [];
let searchIndex = -1;
let searchMode = false;
let replaceMode = false;
let replaceQuery = '';
let replaceText = '';
let replaceStage = 'query';
let openMode = false;
let openPath = '';
let saveAsMode = false;
let saveAsPath = '';
let treeSearchMode = false;
let treeQuery = '';
let treeMatches = [];
let treeSearchIndex = -1;
let treeSearchError = null;

const useColor = !process.env.NO_COLOR;
const color = (code, text) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
const style = {
  bold: text => color('1', text),
  dim: text => color('2', text),
  cyan: text => color('36', text),
  yellow: text => color('33', text),
  green: text => color('32', text),
  red: text => color('31', text),
  magenta: text => color('35', text),
  mode: text => color('30;46', text)
};

function createBuffer(filePath) {
  const buffer = {
    id: nextBufferId++,
    filePath,
    lines: loadExistingFile(filePath),
    cursorRow: 0,
    cursorCol: 0,
    viewportRow: 0,
    dirty: false,
    version: 0
  };
  syntaxService.updateBuffer(buffer.id, buffer.lines, buffer.filePath, buffer.version);
  return buffer;
}

function activeBuffer() {
  return buffers[activeBufferIndex];
}

function syncActiveBuffer() {
  const buffer = activeBuffer();
  buffer.filePath = filePath;
  buffer.lines = lines;
  buffer.cursorRow = cursorRow;
  buffer.cursorCol = cursorCol;
  buffer.viewportRow = viewportRow;
  buffer.dirty = dirty;
  buffer.version = version;
}

function loadActiveBuffer() {
  const buffer = activeBuffer();
  filePath = buffer.filePath;
  lines = buffer.lines;
  cursorRow = buffer.cursorRow;
  cursorCol = buffer.cursorCol;
  viewportRow = buffer.viewportRow;
  dirty = buffer.dirty;
  version = buffer.version;
  searchQuery = '';
  searchMatches = [];
  searchIndex = -1;
  searchMode = false;
  replaceMode = false;
  replaceQuery = '';
  replaceText = '';
  replaceStage = 'query';
  openMode = false;
  openPath = '';
  saveAsMode = false;
  saveAsPath = '';
  treeSearchMode = false;
  treeQuery = '';
  treeMatches = [];
  treeSearchIndex = -1;
  treeSearchError = null;
  quitConfirm = false;
}

function currentEditorState() {
  return { lines, cursorRow, cursorCol, dirty };
}

function applyEditorState(state) {
  lines = state.lines;
  cursorRow = state.cursorRow;
  cursorCol = state.cursorCol;
  dirty = state.dirty;
}

function refreshSyntax() {
  syntaxService.updateBuffer(activeBuffer().id, lines, filePath, version);
}

function markBufferChanged() {
  version++;
  clearTreeSearch();
  refreshSyntax();
}

function clampCursor() {
  applyEditorState(editorState.clampCursor(currentEditorState()));
}

function updateViewport() {
  const rows = process.stdout.rows || 24;
  const visibleLines = Math.max(1, rows - 6);
  if (cursorRow < viewportRow) viewportRow = cursorRow;
  if (cursorRow >= viewportRow + visibleLines) viewportRow = cursorRow - visibleLines + 1;
  if (viewportRow < 0) viewportRow = 0;
  const maxViewportRow = Math.max(0, lines.length - visibleLines);
  if (viewportRow > maxViewportRow) viewportRow = maxViewportRow;
}

function moveLeft() {
  applyEditorState(editorState.moveLeft(currentEditorState()));
}

function moveRight() {
  applyEditorState(editorState.moveRight(currentEditorState()));
}

function moveUp() {
  applyEditorState(editorState.moveUp(currentEditorState()));
}

function moveDown() {
  applyEditorState(editorState.moveDown(currentEditorState()));
}

function insertText(text) {
  applyEditorState(editorState.insertText(currentEditorState(), text));
  markBufferChanged();
}

function insertNewline() {
  applyEditorState(editorState.insertNewline(currentEditorState()));
  markBufferChanged();
}

function backspace() {
  applyEditorState(editorState.backspace(currentEditorState()));
  markBufferChanged();
}

function deleteForward() {
  applyEditorState(editorState.deleteForward(currentEditorState()));
  markBufferChanged();
}

function updateSearchMatches() {
  const state = currentEditorState();
  const result = editorState.updateSearchMatches(state, searchQuery);
  searchMatches = result.matches;
  searchIndex = result.index;
  applyEditorState(state);
}

function replaceCurrent() {
  const state = currentEditorState();
  if (editorState.replaceCurrent(state, searchMatches, searchIndex, replaceQuery, replaceText)) {
    applyEditorState(state);
    markBufferChanged();
    searchQuery = replaceQuery;
    updateSearchMatches();
  }
}

function replaceAll() {
  const state = currentEditorState();
  const changed = editorState.replaceAll(state, replaceQuery, replaceText);
  applyEditorState(state);
  if (changed) markBufferChanged();
  searchQuery = replaceQuery;
  updateSearchMatches();
}

function findNext() {
  if (!searchMatches.length) return;
  searchIndex = editorState.nextSearchIndex(searchMatches, searchIndex);
  applyEditorState(editorState.moveToSearchMatch(currentEditorState(), searchMatches, searchIndex));
}

function findPrevious() {
  if (!searchMatches.length) return;
  searchIndex = editorState.previousSearchIndex(searchMatches, searchIndex);
  applyEditorState(editorState.moveToSearchMatch(currentEditorState(), searchMatches, searchIndex));
}

function updateTreeMatches() {
  treeMatches = [];
  treeSearchIndex = -1;
  treeSearchError = null;
  if (!treeQuery) return;
  const result = syntaxService.treeSearchBuffer(activeBuffer().id, treeQuery);
  treeSearchError = result.error;
  treeMatches = result.matches;
  if (!treeMatches.length) return;
  treeSearchIndex = 0;
  cursorRow = treeMatches[0].row;
  cursorCol = treeMatches[0].col;
}

function clearTreeSearch() {
  treeMatches = [];
  treeSearchIndex = -1;
  treeSearchError = null;
}

function treeSearchNext() {
  if (!treeMatches.length) return;
  treeSearchIndex = (treeSearchIndex + 1) % treeMatches.length;
  cursorRow = treeMatches[treeSearchIndex].row;
  cursorCol = treeMatches[treeSearchIndex].col;
}

function treeSearchPrevious() {
  if (!treeMatches.length) return;
  treeSearchIndex = (treeSearchIndex - 1 + treeMatches.length) % treeMatches.length;
  cursorRow = treeMatches[treeSearchIndex].row;
  cursorCol = treeMatches[treeSearchIndex].col;
}

function promptSearch() {
  searchMode = true;
  searchQuery = '';
  searchMatches = [];
  searchIndex = -1;
}

function promptTreeSearch() {
  treeSearchMode = true;
  treeQuery = '';
  treeMatches = [];
  treeSearchIndex = -1;
  treeSearchError = null;
}

function promptReplace() {
  replaceMode = true;
  replaceQuery = '';
  replaceText = '';
  replaceStage = 'query';
}

function promptSaveAs() {
  saveAsMode = true;
  saveAsPath = '';
}

function promptOpen() {
  openMode = true;
  openPath = '';
}

function switchBuffer(delta) {
  if (buffers.length < 2) return;
  syncActiveBuffer();
  activeBufferIndex = (activeBufferIndex + delta + buffers.length) % buffers.length;
  loadActiveBuffer();
}

function openBuffer(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(process.cwd(), targetPath);
  syncActiveBuffer();
  const existingIndex = buffers.findIndex(buffer => buffer.filePath === resolved);
  if (existingIndex === -1) {
    buffers.push(createBuffer(resolved));
    activeBufferIndex = buffers.length - 1;
  } else {
    activeBufferIndex = existingIndex;
  }
  loadActiveBuffer();
  return true;
}

function bufferName(buffer) {
  return buffer.filePath ? path.relative(process.cwd(), buffer.filePath) : '[No file]';
}

function truncate(text, width) {
  if (text.length <= width) return text;
  return text.slice(0, Math.max(0, width - 1)) + '…';
}

function styleCapture(capture, text) {
  if (capture === 'comment') return style.dim(text);
  if (capture === 'keyword') return style.magenta(text);
  if (capture === 'string') return style.green(text);
  if (capture === 'number') return style.yellow(text);
  if (capture === 'function') return style.cyan(text);
  if (capture === 'property') return style.yellow(text);
  if (capture === 'error' || capture === 'syntax.error') return style.red(text);
  if (capture === 'tree.current') return style.mode(text);
  if (capture === 'tree.match') return style.cyan(text);
  return text;
}

function lineDecorations(row, highlights) {
  const decorations = highlights.filter(span => span.row === row && span.endRow === row && span.endCol > span.col);
  for (const match of treeMatches) {
    if (match.row === row && match.endRow === row && match.endCol > match.col) {
      decorations.push({ ...match, capture: 'tree.match' });
    }
  }
  const currentTreeMatch = treeMatches[treeSearchIndex];
  if (currentTreeMatch && currentTreeMatch.row === row && currentTreeMatch.endRow === row && currentTreeMatch.endCol > currentTreeMatch.col) {
    decorations.push({ ...currentTreeMatch, capture: 'tree.current' });
  }
  return decorations.sort((left, right) => {
    if (left.col !== right.col) return left.col - right.col;
    return right.endCol - left.endCol;
  });
}

function renderDecoratedLine(line, row, width, highlights) {
  const visible = truncate(line, width);
  const decorations = lineDecorations(row, highlights);
  let output = '';
  let offset = 0;
  for (const span of decorations) {
    const start = Math.max(0, Math.min(visible.length, span.col));
    const end = Math.max(start, Math.min(visible.length, span.endCol));
    if (start < offset || start === end) continue;
    output += visible.slice(offset, start);
    output += styleCapture(span.capture, visible.slice(start, end));
    offset = end;
  }
  return output + visible.slice(offset);
}

function separator(cols) {
  return style.dim('─'.repeat(Math.max(1, cols)));
}

function renderHeader(cols, status) {
  const appName = ' text-editor ';
  const dirtyPlain = dirty ? ' ● modified' : '';
  const dirtyText = dirty ? ` ${style.yellow('● modified')}` : '';
  const bufferPlain = ` ${activeBufferIndex + 1}/${buffers.length}`;
  const bufferText = style.dim(bufferPlain);
  const fileNameWidth = Math.max(5, cols - appName.length - dirtyPlain.length - bufferPlain.length - 2);
  const fileName = style.bold(truncate(status, fileNameWidth));
  return `${style.cyan(style.bold(appName))}${style.dim('─')} ${fileName}${dirtyText}${bufferText}`;
}

function renderTabs(cols) {
  let used = 0;
  let output = '';
  for (let index = 0; index < buffers.length; index++) {
    const buffer = buffers[index];
    const name = truncate(bufferName(buffer), 14);
    const plain = ` ${index + 1}:${name}${buffer.dirty ? ' ●' : ''} `;
    if (used + plain.length > cols) {
      output += style.dim(' …');
      break;
    }
    const label = buffer.dirty ? ` ${index + 1}:${name} ${style.yellow('●')} ` : plain;
    output += index === activeBufferIndex ? style.mode(label) : style.dim(label);
    used += plain.length;
  }
  return output || ' ';
}

function renderPrompt() {
  if (openMode) return `${style.yellow('Open:')} ${openPath}`;
  if (saveAsMode) return `${style.yellow('Save as:')} ${saveAsPath}`;
  if (replaceMode) return replaceStage === 'query' ? `${style.yellow('Replace find:')} ${replaceQuery}` : `${style.yellow('Replace with:')} ${replaceText}`;
  if (searchMode) return `${style.yellow('Search:')} ${searchQuery || ''}`;
  if (treeSearchMode) return `${style.yellow('Tree query:')} ${treeQuery || ''}`;
  if (quitConfirm) return style.red('Unsaved changes! Press Ctrl+Q again to quit');
  const syntax = syntaxService.getBufferState(activeBuffer().id);
  const syntaxStatus = syntax && syntax.supported && syntax.available ? `   AST ${syntax.errors.length ? style.red(`${syntax.errors.length} error${syntax.errors.length === 1 ? '' : 's'}`) : style.green('ok')}` : '';
  const treeStatus = treeMatches.length ? `   Tree ${treeSearchIndex + 1}/${treeMatches.length}` : treeSearchError ? `   ${style.red('Tree error')}` : '';
  return `${style.mode(' EDIT ')}  Ln ${cursorRow + 1}, Col ${cursorCol + 1}   ${lines.length} lines   ${dirty ? style.yellow('modified') : style.green('saved')}${syntaxStatus}${treeStatus}`;
}

function renderHelp() {
  if (openMode) return `${style.bold('Enter')} ${style.dim('open')}  ${style.bold('Esc')} ${style.dim('cancel')}`;
  if (saveAsMode) return `${style.bold('Enter')} ${style.dim('save')}  ${style.bold('Esc')} ${style.dim('cancel')}`;
  if (replaceMode) return `${style.bold('Enter')} ${style.dim('accept')}  ${style.bold('Esc')} ${style.dim('cancel')}  ${style.bold('Ctrl+R')} ${style.dim('replace all')}  ${style.bold('Ctrl+F')} ${style.dim('search')}`;
  if (searchMode) return `${style.bold('Enter')} ${style.dim('search')}  ${style.bold('Esc')} ${style.dim('cancel')}  ${style.bold('Ctrl+F')} ${style.dim('search')}  ${style.bold('Ctrl+G')} ${style.dim('next')}  ${style.bold('Ctrl+Shift+G')} ${style.dim('prev')}`;
  if (treeSearchMode) return `${style.bold('Enter')} ${style.dim('tree search')}  ${style.bold('Esc')} ${style.dim('cancel')}  ${style.bold('Ctrl+G')} ${style.dim('next')}  ${style.bold('Ctrl+Shift+G')} ${style.dim('prev')}`;
  return `${style.bold('Ctrl+S')} ${style.dim('Save')}  ${style.bold('Ctrl+O')} ${style.dim('Open')}  ${style.bold('Ctrl+N/P')} ${style.dim('Next/Prev')}  ${style.bold('Ctrl+Q')} ${style.dim('Quit')}  ${style.bold('Ctrl+F')} ${style.dim('Search')}  ${style.bold('Ctrl+R')} ${style.dim('Replace')}  ${style.bold('Ctrl+T')} ${style.dim('Tree')}`;
}

function render() {
  updateViewport();
  syncActiveBuffer();
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const visibleLines = Math.max(1, rows - 6);
  const visibleText = Array.from({ length: visibleLines }, (_, index) => lines[viewportRow + index] || '');
  const status = filePath ? path.relative(process.cwd(), filePath) : '[No file]';
  const totalLines = lines.length;
  const syntax = syntaxService.getBufferState(activeBuffer().id);
  const highlights = syntax ? syntax.highlights : [];
  const gutterWidth = String(Math.max(totalLines, viewportRow + visibleLines)).length;
  const gutterLength = gutterWidth + 5;
  const textWidth = Math.max(1, cols - gutterLength);
  const output = '\u001b[?25l\u001b[2J\u001b[H' + [
    renderHeader(cols, status),
    renderTabs(cols),
    separator(cols),
    ...visibleText.map((line, index) => {
      const absoluteRow = viewportRow + index;
      const active = absoluteRow === cursorRow;
      const caret = active ? style.cyan('>') : ' ';
      const lineNumber = String(absoluteRow + 1).padStart(gutterWidth);
      const gutter = `${caret} ${style.dim(lineNumber)} ${style.dim('│')} `;
      return `${gutter}${renderDecoratedLine(line, absoluteRow, textWidth, highlights)}`;
    }),
    separator(cols),
    renderPrompt(),
    renderHelp()
  ].join('\n');
  process.stdout.write(output);
  const promptRow = 5 + visibleText.length;
  let targetRow = 4 + (cursorRow - viewportRow);
  let targetCol = gutterLength + Math.min(cursorCol, textWidth - 1) + 1;
  if (openMode) {
    targetRow = promptRow;
    targetCol = 'Open: '.length + openPath.length + 1;
  } else if (saveAsMode) {
    targetRow = promptRow;
    targetCol = 'Save as: '.length + saveAsPath.length + 1;
  } else if (replaceMode) {
    const prompt = replaceStage === 'query' ? 'Replace find: ' : 'Replace with: ';
    const input = replaceStage === 'query' ? replaceQuery : replaceText;
    targetRow = promptRow;
    targetCol = prompt.length + input.length + 1;
  } else if (searchMode) {
    targetRow = promptRow;
    targetCol = 'Search: '.length + searchQuery.length + 1;
  } else if (treeSearchMode) {
    targetRow = promptRow;
    targetCol = 'Tree query: '.length + treeQuery.length + 1;
  }
  process.stdout.write(`\u001b[${targetRow};${targetCol}H\u001b[?25h`);
}

function save(targetPath = filePath) {
  if (!targetPath) {
    return false;
  }
  saveFile(targetPath, lines);
  dirty = false;
  syncActiveBuffer();
  return true;
}

function saveAs(targetPath) {
  const resolved = saveAsFile(targetPath, lines);
  if (resolved) {
    filePath = resolved;
    dirty = false;
    version++;
    refreshSyntax();
    syncActiveBuffer();
  }
  return resolved;
}

function quit() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdout.write('\u001b[0m\u001b[?25h\u001b[?1049l\n');
  process.exit(0);
}

function requestQuit() {
  syncActiveBuffer();
  if (buffers.some(buffer => buffer.dirty) && !quitConfirm) {
    quitConfirm = true;
    render();
    return;
  }
  quit();
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdout.write('\u001b[?1049h\u001b[?25l');

process.stdin.on('keypress', (_, key) => {
  if (!key) return;
  if (key.ctrl && key.name === 'c') {
    quit();
    return;
  }
  if (openMode) {
    if (key.name === 'escape') {
      openMode = false;
      openPath = '';
      render();
      return;
    }
    if (key.name === 'return') {
      if (openBuffer(openPath)) {
        openMode = false;
        openPath = '';
      }
      render();
      return;
    }
    if (key.name === 'backspace') {
      openPath = openPath.slice(0, -1);
      render();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      openPath += key.sequence;
      render();
      return;
    }
    return;
  }
  if (saveAsMode) {
    if (key.name === 'escape') {
      saveAsMode = false;
      saveAsPath = '';
      render();
      return;
    }
    if (key.name === 'return') {
      const resolved = saveAs(saveAsPath);
      if (resolved) {
        saveAsMode = false;
        filePath = resolved;
        quitConfirm = false;
      }
      render();
      return;
    }
    if (key.name === 'backspace') {
      saveAsPath = saveAsPath.slice(0, -1);
      render();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      saveAsPath += key.sequence;
      render();
      return;
    }
    return;
  }
  if (replaceMode) {
    if (key.name === 'escape') {
      replaceMode = false;
      replaceQuery = '';
      replaceText = '';
      replaceStage = 'query';
      render();
      return;
    }
    if (key.name === 'return') {
      if (replaceStage === 'query') {
        searchQuery = replaceQuery;
        updateSearchMatches();
        replaceStage = 'text';
      } else {
        replaceCurrent();
        replaceMode = false;
      }
      render();
      return;
    }
    if (key.name === 'backspace') {
      if (replaceStage === 'query') replaceQuery = replaceQuery.slice(0, -1);
      else replaceText = replaceText.slice(0, -1);
      render();
      return;
    }
    if (key.ctrl && key.name === 'r') {
      if (replaceStage === 'text') replaceAll();
      render();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      if (replaceStage === 'query') replaceQuery += key.sequence;
      else replaceText += key.sequence;
      render();
      return;
    }
    return;
  }
  if (searchMode) {
    if (key.name === 'escape') {
      searchMode = false;
      render();
      return;
    }
    if (key.name === 'return') {
      searchMode = false;
      render();
      return;
    }
    if (key.name === 'backspace') {
      searchQuery = searchQuery.slice(0, -1);
      updateSearchMatches();
      render();
      return;
    }
    if (key.ctrl && key.name === 'g') {
      if (key.shift) findPrevious();
      else findNext();
      render();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      searchQuery += key.sequence;
      updateSearchMatches();
      render();
      return;
    }
    return;
  }
  if (treeSearchMode) {
    if (key.name === 'escape') {
      treeSearchMode = false;
      render();
      return;
    }
    if (key.name === 'return') {
      updateTreeMatches();
      treeSearchMode = false;
      render();
      return;
    }
    if (key.name === 'backspace') {
      treeQuery = treeQuery.slice(0, -1);
      render();
      return;
    }
    if (key.ctrl && key.name === 'g') {
      if (key.shift) treeSearchPrevious();
      else treeSearchNext();
      render();
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      treeQuery += key.sequence;
      render();
      return;
    }
    return;
  }
  if (key.ctrl && key.name === 'q') {
    requestQuit();
    return;
  }
  if (key.ctrl && key.name === 'o') {
    promptOpen();
    render();
    return;
  }
  if (key.ctrl && key.name === 'n') {
    switchBuffer(1);
    render();
    return;
  }
  if (key.ctrl && key.name === 'p') {
    switchBuffer(-1);
    render();
    return;
  }
  if (key.ctrl && key.name === 's') {
    if (!filePath) {
      promptSaveAs();
      render();
      return;
    }
    if (!save()) {
      process.stdout.write('\u001b[0m\nNo file path set. Start with: npm start -- path/to/file.txt\n');
      render();
      return;
    }
    quitConfirm = false;
    render();
    return;
  }
  if (key.ctrl && key.name === 'f') {
    promptSearch();
    render();
    return;
  }
  if (key.ctrl && key.name === 'r') {
    promptReplace();
    render();
    return;
  }
  if (key.ctrl && key.name === 't') {
    promptTreeSearch();
    render();
    return;
  }
  if (key.ctrl && key.name === 'g') {
    if (treeMatches.length) {
      if (key.shift) treeSearchPrevious();
      else treeSearchNext();
    } else if (key.shift) findPrevious();
    else findNext();
    render();
    return;
  }
  if (key.name === 'left') moveLeft();
  else if (key.name === 'right') moveRight();
  else if (key.name === 'up') moveUp();
  else if (key.name === 'down') moveDown();
  else if (key.name === 'backspace') backspace();
  else if (key.name === 'delete') deleteForward();
  else if (key.name === 'return') insertNewline();
  else if (key.name === 'tab') insertText('  ');
  else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) insertText(key.sequence);
  quitConfirm = false;
  clampCursor();
  syncActiveBuffer();
  render();
});

process.stdout.on('resize', render);

process.on('SIGINT', quit);
render();
