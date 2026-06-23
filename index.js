const path = require('path');
const readline = require('readline');
const { loadExistingFile, saveFile, saveAsFile } = require('./editorCore');

const initialFilePaths = process.argv.slice(2).map(file => path.resolve(process.cwd(), file));
let buffers = initialFilePaths.length ? initialFilePaths.map(createBuffer) : [createBuffer(null)];
let activeBufferIndex = 0;
let filePath = buffers[0].filePath;
let lines = buffers[0].lines;
let cursorRow = buffers[0].cursorRow;
let cursorCol = buffers[0].cursorCol;
let viewportRow = buffers[0].viewportRow;
let dirty = buffers[0].dirty;
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

const useColor = !process.env.NO_COLOR;
const color = (code, text) => useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
const style = {
  bold: text => color('1', text),
  dim: text => color('2', text),
  cyan: text => color('36', text),
  yellow: text => color('33', text),
  green: text => color('32', text),
  red: text => color('31', text),
  mode: text => color('30;46', text)
};

function createBuffer(filePath) {
  return {
    filePath,
    lines: loadExistingFile(filePath),
    cursorRow: 0,
    cursorCol: 0,
    viewportRow: 0,
    dirty: false
  };
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
}

function loadActiveBuffer() {
  const buffer = activeBuffer();
  filePath = buffer.filePath;
  lines = buffer.lines;
  cursorRow = buffer.cursorRow;
  cursorCol = buffer.cursorCol;
  viewportRow = buffer.viewportRow;
  dirty = buffer.dirty;
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
  quitConfirm = false;
}

function clampCursor() {
  if (cursorRow < 0) cursorRow = 0;
  if (cursorRow >= lines.length) cursorRow = lines.length - 1;
  if (cursorRow < 0) cursorRow = 0;
  const maxCol = lines[cursorRow] ? lines[cursorRow].length : 0;
  if (cursorCol < 0) cursorCol = 0;
  if (cursorCol > maxCol) cursorCol = maxCol;
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
  if (cursorCol > 0) cursorCol--;
  else if (cursorRow > 0) {
    cursorRow--;
    cursorCol = lines[cursorRow].length;
  }
}

function moveRight() {
  if (cursorCol < lines[cursorRow].length) cursorCol++;
  else if (cursorRow < lines.length - 1) {
    cursorRow++;
    cursorCol = 0;
  }
}

function moveUp() {
  if (cursorRow > 0) {
    cursorRow--;
    cursorCol = Math.min(cursorCol, lines[cursorRow].length);
  }
}

function moveDown() {
  if (cursorRow < lines.length - 1) {
    cursorRow++;
    cursorCol = Math.min(cursorCol, lines[cursorRow].length);
  }
}

function insertText(text) {
  const line = lines[cursorRow];
  lines[cursorRow] = line.slice(0, cursorCol) + text + line.slice(cursorCol);
  cursorCol += text.length;
  dirty = true;
}

function insertNewline() {
  const line = lines[cursorRow];
  const left = line.slice(0, cursorCol);
  const right = line.slice(cursorCol);
  lines[cursorRow] = left;
  lines.splice(cursorRow + 1, 0, right);
  cursorRow++;
  cursorCol = 0;
  dirty = true;
}

function backspace() {
  if (cursorCol > 0) {
    const line = lines[cursorRow];
    lines[cursorRow] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
    cursorCol--;
  } else if (cursorRow > 0) {
    const prev = lines[cursorRow - 1];
    const current = lines[cursorRow];
    cursorCol = prev.length;
    lines[cursorRow - 1] = prev + current;
    lines.splice(cursorRow, 1);
    cursorRow--;
  }
  dirty = true;
}

function deleteForward() {
  const line = lines[cursorRow];
  if (cursorCol < line.length) {
    lines[cursorRow] = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
  } else if (cursorRow < lines.length - 1) {
    lines[cursorRow] = line + lines[cursorRow + 1];
    lines.splice(cursorRow + 1, 1);
  }
  dirty = true;
}

function updateSearchMatches() {
  searchMatches = [];
  if (!searchQuery) {
    searchIndex = -1;
    return;
  }
  for (let row = 0; row < lines.length; row++) {
    let start = 0;
    while (start <= lines[row].length) {
      const col = lines[row].indexOf(searchQuery, start);
      if (col === -1) break;
      searchMatches.push({ row, col });
      start = col + Math.max(1, searchQuery.length);
    }
  }
  if (searchMatches.length === 0) {
    searchIndex = -1;
    return;
  }
  searchIndex = searchMatches.findIndex(match => match.row === cursorRow && match.col === cursorCol);
  if (searchIndex === -1) searchIndex = 0;
  cursorRow = searchMatches[searchIndex].row;
  cursorCol = searchMatches[searchIndex].col;
}

function replaceCurrent() {
  if (!searchMatches.length || searchIndex < 0 || !replaceQuery) return;
  const match = searchMatches[searchIndex];
  const line = lines[match.row];
  lines[match.row] = line.slice(0, match.col) + replaceText + line.slice(match.col + replaceQuery.length);
  dirty = true;
  cursorRow = match.row;
  cursorCol = match.col + replaceText.length;
  searchQuery = replaceQuery;
  updateSearchMatches();
}

function replaceAll() {
  if (!replaceQuery) return;
  let changed = false;
  for (let row = 0; row < lines.length; row++) {
    if (lines[row].includes(replaceQuery)) {
      lines[row] = lines[row].split(replaceQuery).join(replaceText);
      changed = true;
    }
  }
  if (changed) dirty = true;
  searchQuery = replaceQuery;
  updateSearchMatches();
}

function findNext() {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex + 1) % searchMatches.length;
  cursorRow = searchMatches[searchIndex].row;
  cursorCol = searchMatches[searchIndex].col;
}

function findPrevious() {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
  cursorRow = searchMatches[searchIndex].row;
  cursorCol = searchMatches[searchIndex].col;
}

function promptSearch() {
  searchMode = true;
  searchQuery = '';
  searchMatches = [];
  searchIndex = -1;
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
  if (quitConfirm) return style.red('Unsaved changes! Press Ctrl+Q again to quit');
  return `${style.mode(' EDIT ')}  Ln ${cursorRow + 1}, Col ${cursorCol + 1}   ${lines.length} lines   ${dirty ? style.yellow('modified') : style.green('saved')}`;
}

function renderHelp() {
  if (openMode) return `${style.bold('Enter')} ${style.dim('open')}  ${style.bold('Esc')} ${style.dim('cancel')}`;
  if (saveAsMode) return `${style.bold('Enter')} ${style.dim('save')}  ${style.bold('Esc')} ${style.dim('cancel')}`;
  if (replaceMode) return `${style.bold('Enter')} ${style.dim('accept')}  ${style.bold('Esc')} ${style.dim('cancel')}  ${style.bold('Ctrl+R')} ${style.dim('replace all')}  ${style.bold('Ctrl+F')} ${style.dim('search')}`;
  if (searchMode) return `${style.bold('Enter')} ${style.dim('search')}  ${style.bold('Esc')} ${style.dim('cancel')}  ${style.bold('Ctrl+F')} ${style.dim('search')}  ${style.bold('Ctrl+G')} ${style.dim('next')}  ${style.bold('Ctrl+Shift+G')} ${style.dim('prev')}`;
  return `${style.bold('Ctrl+S')} ${style.dim('Save')}  ${style.bold('Ctrl+O')} ${style.dim('Open')}  ${style.bold('Ctrl+N/P')} ${style.dim('Next/Prev')}  ${style.bold('Ctrl+Q')} ${style.dim('Quit')}  ${style.bold('Ctrl+C')} ${style.dim('Force quit')}  ${style.bold('Ctrl+F')} ${style.dim('Search')}  ${style.bold('Ctrl+R')} ${style.dim('Replace')}`;
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
      return `${gutter}${truncate(line, textWidth)}`;
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
  if (key.ctrl && key.name === 'g') {
    if (key.shift) findPrevious();
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
