const path = require('path');
const readline = require('readline');
const { loadExistingFile, saveFile, saveAsFile } = require('./editorCore');
const editorState = require('./editorState');
const documentModel = require('./documentModel');
const { createLspManager, defaultLspConfigs } = require('./lspManager');
const { severityLabel } = require('./lspDiagnostics');
const syntaxService = require('./syntaxService');
const display = require('./displayWidth');
const keybindings = require('./keybindings');

const initialFilePaths = process.argv.slice(2).map(file => path.resolve(process.cwd(), file));
const document = documentModel.createDocument(initialFilePaths, loadExistingFile);
document.buffers.forEach(buffer => syntaxService.updateBuffer(buffer.id, buffer.lines, buffer.filePath, buffer.version));
const lspManager = createLspManager({ configs: defaultLspConfigs(), onDiagnostics: () => render() });
document.buffers.forEach(buffer => { void lspManager.openBuffer(buffer); });
let filePath = document.buffers[0].filePath;
let lines = document.buffers[0].lines;
let cursorRow = document.buffers[0].cursorRow;
let cursorCol = document.buffers[0].cursorCol;
let viewportRow = document.buffers[0].viewportRow;
let viewportCol = document.buffers[0].viewportCol;
let dirty = document.buffers[0].dirty;
let version = document.buffers[0].version;
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
let lspHoverMessage = '';
let lspHoverRequestId = 0;
let quitting = false;

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

function activeBuffer() {
  return documentModel.activeBuffer(document);
}

function syncActiveBuffer() {
  const buffer = activeBuffer();
  buffer.filePath = filePath;
  buffer.lines = lines;
  buffer.cursorRow = cursorRow;
  buffer.cursorCol = cursorCol;
  buffer.viewportRow = viewportRow;
  buffer.viewportCol = viewportCol;
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
  viewportCol = buffer.viewportCol;
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
  clearHoverMessage();
  quitConfirm = false;
}

function currentEditorState() {
  return { lines, cursorRow, cursorCol, dirty };
}

function clearHoverMessage() {
  lspHoverMessage = '';
  lspHoverRequestId++;
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
  clearHoverMessage();
  documentModel.markChanged(activeBuffer());
  version = activeBuffer().version;
  dirty = activeBuffer().dirty;
  syncActiveBuffer();
  clearTreeSearch();
  refreshSyntax();
  void lspManager.changeBuffer(activeBuffer());
}

function clampCursor() {
  applyEditorState(editorState.clampCursor(currentEditorState()));
}

function editorMetrics(rows = process.stdout.rows || 24, cols = process.stdout.columns || 80) {
  const sidebarWidth = sidebarWidthForCols(cols);
  const leftCols = sidebarWidth ? cols - sidebarWidth - 1 : cols;
  const visibleLines = Math.max(1, rows - 6);
  const gutterWidth = String(Math.max(lines.length, viewportRow + visibleLines)).length;
  const gutterLength = gutterWidth + 5;
  const textWidth = Math.max(1, leftCols - gutterLength);
  return { sidebarWidth, leftCols, visibleLines, gutterWidth, gutterLength, textWidth };
}

function updateViewport() {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const visibleLines = Math.max(1, rows - 6);
  if (cursorRow < viewportRow) viewportRow = cursorRow;
  if (cursorRow >= viewportRow + visibleLines) viewportRow = cursorRow - visibleLines + 1;
  if (viewportRow < 0) viewportRow = 0;
  const maxViewportRow = Math.max(0, lines.length - visibleLines);
  if (viewportRow > maxViewportRow) viewportRow = maxViewportRow;
  const { textWidth } = editorMetrics(rows, cols);
  const cursorColumn = display.textWidth(lines[cursorRow].slice(0, cursorCol));
  if (cursorColumn < viewportCol) viewportCol = cursorColumn;
  if (cursorColumn >= viewportCol + textWidth) viewportCol = cursorColumn - textWidth + 1;
  if (viewportCol < 0) viewportCol = 0;
}

function moveLeft() {
  clearHoverMessage();
  applyEditorState(editorState.moveLeft(currentEditorState()));
}

function moveRight() {
  clearHoverMessage();
  applyEditorState(editorState.moveRight(currentEditorState()));
}

function moveUp() {
  clearHoverMessage();
  applyEditorState(editorState.moveUp(currentEditorState()));
}

function moveDown() {
  clearHoverMessage();
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
  clearHoverMessage();
  searchIndex = editorState.nextSearchIndex(searchMatches, searchIndex);
  applyEditorState(editorState.moveToSearchMatch(currentEditorState(), searchMatches, searchIndex));
}

function findPrevious() {
  if (!searchMatches.length) return;
  clearHoverMessage();
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
  clearHoverMessage();
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
  clearHoverMessage();
  treeSearchIndex = (treeSearchIndex + 1) % treeMatches.length;
  cursorRow = treeMatches[treeSearchIndex].row;
  cursorCol = treeMatches[treeSearchIndex].col;
}

function treeSearchPrevious() {
  if (!treeMatches.length) return;
  clearHoverMessage();
  treeSearchIndex = (treeSearchIndex - 1 + treeMatches.length) % treeMatches.length;
  cursorRow = treeMatches[treeSearchIndex].row;
  cursorCol = treeMatches[treeSearchIndex].col;
}

function isHoverKey(key) {
  return keybindings.matches('hover', key);
}

function isTextKey(key) {
  return key.sequence && !key.ctrl && !key.meta && (key.sequence.length === 1 || !key.name);
}

async function showHover() {
  syncActiveBuffer();
  const requestId = ++lspHoverRequestId;
  const bufferId = activeBuffer().id;
  const row = cursorRow;
  const col = cursorCol;
  const languageId = documentModel.languageIdForFilePath(filePath);
  if (languageId !== 'javascript') {
    lspHoverMessage = 'LSP hover: JavaScript files only';
    render();
    return;
  }
  if (!lspManager.isSupported(activeBuffer())) {
    lspHoverMessage = 'LSP hover: not enabled';
    render();
    return;
  }
  lspHoverMessage = 'LSP hover: loading';
  render();
  const message = await lspManager.hover(activeBuffer(), row, col);
  if (requestId !== lspHoverRequestId || activeBuffer().id !== bufferId || cursorRow !== row || cursorCol !== col) return;
  const lspStatus = lspManager.status.get(languageId);
  lspHoverMessage = message ? `LSP hover: ${message}` : lspStatus && lspStatus.available === false ? `LSP hover: server unavailable (${lspStatus.error})` : 'LSP hover: unavailable at cursor';
  render();
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
  if (document.buffers.length < 2) return;
  syncActiveBuffer();
  documentModel.switchBuffer(document, delta);
  loadActiveBuffer();
}

function openBuffer(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(process.cwd(), targetPath);
  syncActiveBuffer();
  const existingIndex = documentModel.findBufferIndex(document, resolved);
  if (existingIndex === -1) {
    const buffer = documentModel.addBuffer(document, resolved, loadExistingFile(resolved));
    syntaxService.updateBuffer(buffer.id, buffer.lines, buffer.filePath, buffer.version);
    void lspManager.openBuffer(buffer);
  } else {
    document.activeBufferIndex = existingIndex;
  }
  loadActiveBuffer();
  return true;
}

function bufferName(buffer) {
  return buffer.filePath ? path.relative(process.cwd(), buffer.filePath) : '[No file]';
}

function truncate(text, width) {
  return display.truncate(text, width);
}

function stripAnsi(text) {
  return display.stripAnsi(text);
}

function padRendered(text, width) {
  return display.padRendered(text, width);
}

function wrapText(text, width) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + word.length + 1 <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function styleCapture(capture, text) {
  if (capture === 'comment') return style.dim(text);
  if (capture === 'keyword') return style.magenta(text);
  if (capture === 'string') return style.green(text);
  if (capture === 'string.special') return style.green(text);
  if (capture === 'number') return style.yellow(text);
  if (capture === 'function') return style.cyan(text);
  if (capture === 'function.call') return style.cyan(text);
  if (capture === 'function.method') return style.cyan(text);
  if (capture === 'property') return style.yellow(text);
  if (capture === 'constructor') return style.cyan(text);
  if (capture === 'constant') return style.yellow(text);
  if (capture === 'constant.builtin') return style.yellow(text);
  if (capture === 'variable.builtin') return style.magenta(text);
  if (capture === 'operator') return style.magenta(text);
  if (capture === 'error' || capture === 'syntax.error') return style.red(text);
  if (capture === 'search.current') return style.mode(text);
  if (capture === 'search.match') return style.yellow(text);
  if (capture === 'tree.current') return style.mode(text);
  if (capture === 'tree.match') return style.cyan(text);
  return text;
}

function decorationPriority(capture) {
  if (capture === 'tree.current') return 5;
  if (capture === 'search.current') return 4;
  if (capture === 'tree.match') return 3;
  if (capture === 'search.match') return 2;
  return 1;
}

function decorationsOverlap(left, right) {
  return left.row === right.row && left.endRow === right.endRow && left.col < right.endCol && right.col < left.endCol;
}

function lineDecorations(row, highlights) {
  const priorityDecorations = [];
  if (searchQuery) {
    for (let index = 0; index < searchMatches.length; index++) {
      const match = searchMatches[index];
      if (match.row === row) {
        priorityDecorations.push({
          ...match,
          endRow: match.row,
          endCol: match.col + searchQuery.length,
          capture: index === searchIndex ? 'search.current' : 'search.match'
        });
      }
    }
  }
  for (const match of treeMatches) {
    if (match.row === row && match.endRow === row && match.endCol > match.col) {
      priorityDecorations.push({ ...match, capture: 'tree.match' });
    }
  }
  const currentTreeMatch = treeMatches[treeSearchIndex];
  if (currentTreeMatch && currentTreeMatch.row === row && currentTreeMatch.endRow === row && currentTreeMatch.endCol > currentTreeMatch.col) {
    priorityDecorations.push({ ...currentTreeMatch, capture: 'tree.current' });
  }
  const decorations = highlights.filter(span => span.row === row && span.endRow === row && span.endCol > span.col && !priorityDecorations.some(priority => decorationsOverlap(span, priority))).concat(priorityDecorations);
  return decorations.sort((left, right) => {
    if (left.col !== right.col) return left.col - right.col;
    if (decorationPriority(left.capture) !== decorationPriority(right.capture)) return decorationPriority(right.capture) - decorationPriority(left.capture);
    return right.endCol - left.endCol;
  });
}

function renderDecoratedLine(line, row, width, highlights, startColumn = 0) {
  const visibleSlice = display.sliceByColumns(line, startColumn, width);
  const visible = visibleSlice.text;
  const decorations = lineDecorations(row, highlights);
  let output = '';
  let offset = visibleSlice.start;
  for (const span of decorations) {
    const start = Math.max(visibleSlice.start, Math.min(visibleSlice.end, span.col));
    const end = Math.max(start, Math.min(visibleSlice.end, span.endCol));
    if (start < offset || start === end) continue;
    output += display.displayText(line.slice(offset, start));
    output += styleCapture(span.capture, display.displayText(line.slice(start, end)));
    offset = end;
  }
  return output + display.displayText(line.slice(offset, visibleSlice.end));
}

function separator(cols) {
  return style.dim('─'.repeat(Math.max(1, cols)));
}

function renderHeader(cols, status) {
  const appName = ' text-editor ';
  const dirtyPlain = dirty ? ' ● modified' : '';
  const dirtyText = dirty ? ` ${style.yellow('● modified')}` : '';
  const bufferPlain = ` ${document.activeBufferIndex + 1}/${document.buffers.length}`;
  const bufferText = style.dim(bufferPlain);
  const fileNameWidth = Math.max(5, cols - appName.length - dirtyPlain.length - bufferPlain.length - 2);
  const fileName = style.bold(truncate(status, fileNameWidth));
  return `${style.cyan(style.bold(appName))}${style.dim('─')} ${fileName}${dirtyText}${bufferText}`;
}

function renderTabs(cols) {
  let used = 0;
  let output = '';
  for (let index = 0; index < document.buffers.length; index++) {
    const buffer = document.buffers[index];
    const name = truncate(bufferName(buffer), 14);
    const plain = ` ${index + 1}:${name}${buffer.dirty ? ' ●' : ''} `;
    if (used + plain.length > cols) {
      output += style.dim(' …');
      break;
    }
    const label = buffer.dirty ? ` ${index + 1}:${name} ${style.yellow('●')} ` : plain;
    output += index === document.activeBufferIndex ? style.mode(label) : style.dim(label);
    used += plain.length;
  }
  return output || ' ';
}

function renderPrompt(showInlineLsp = true) {
  if (openMode) return `${style.yellow('Open:')} ${openPath}`;
  if (saveAsMode) return `${style.yellow('Save as:')} ${saveAsPath}`;
  if (replaceMode) return replaceStage === 'query' ? `${style.yellow('Replace find:')} ${replaceQuery}` : `${style.yellow('Replace with:')} ${replaceText}`;
  if (searchMode) return `${style.yellow('Search:')} ${searchQuery || ''}`;
  if (treeSearchMode) return `${style.yellow('Tree query/preset:')} ${treeQuery || ''}`;
  if (quitConfirm) return style.red('Unsaved changes! Press Ctrl+Q again to quit');
  const syntax = syntaxService.getBufferState(activeBuffer().id);
  const syntaxStatus = syntax && syntax.supported && syntax.available ? `   AST ${syntax.errors.length ? style.red(`${syntax.errors.length} error${syntax.errors.length === 1 ? '' : 's'}`) : style.green('ok')}` : '';
  const treeStatus = treeMatches.length ? `   Tree ${treeSearchIndex + 1}/${treeMatches.length}` : treeSearchError ? `   ${style.red('Tree error')}` : '';
  const diagnosticSummary = lspManager.diagnosticSummary(activeBuffer(), cursorRow, cursorCol);
  const hoverStatus = showInlineLsp && lspHoverMessage ? `   ${style.cyan(lspHoverMessage)}` : '';
  const diagnosticStatus = showInlineLsp && diagnosticSummary ? `   ${style.red(diagnosticSummary)}` : '';
  return `${style.mode(' EDIT ')}  Ln ${cursorRow + 1}, Col ${cursorCol + 1}   ${lines.length} lines   ${dirty ? style.yellow('modified') : style.green('saved')}${syntaxStatus}${treeStatus}${hoverStatus || diagnosticStatus}`;
}

function sidebarWidthForCols(cols) {
  if (cols < 80) return 0;
  return Math.min(36, Math.max(26, Math.floor(cols * 0.32)));
}

function renderSidebarLines(height, width) {
  if (!width) return [];
  const contentWidth = Math.max(1, width - 2);
  const buffer = activeBuffer();
  const languageId = documentModel.languageIdForFilePath(filePath);
  const diagnostics = lspManager.diagnosticsForBuffer(buffer);
  const lspStatus = languageId ? lspManager.status.get(languageId) : null;
  const lines = [style.bold(' LSP')];

  if (languageId !== 'javascript') {
    lines.push('', style.dim(' JavaScript files only'));
  } else if (!lspManager.isSupported(buffer)) {
    lines.push('', style.yellow(' Not enabled'));
  } else if (lspStatus && lspStatus.available === false) {
    lines.push('', style.red(' Server unavailable'));
    lines.push(...wrapText(lspStatus.error || 'Unknown error', contentWidth).map(line => ` ${line}`));
  } else {
    lines.push('', lspStatus && lspStatus.available ? style.green(' Server ready') : style.dim(' Server pending'));
  }

  if (lspHoverMessage) {
    lines.push('', style.bold(' Hover'));
    lines.push(...wrapText(lspHoverMessage, contentWidth).map(line => ` ${style.cyan(line)}`));
  }

  lines.push('', style.bold(` Diagnostics (${diagnostics.length})`));
  if (diagnostics.length) {
    const shownDiagnostics = diagnostics.slice(0, 3);
    shownDiagnostics.forEach(diagnostic => {
      const label = severityLabel(diagnostic.severity);
      const row = diagnostic.range && diagnostic.range.start ? diagnostic.range.start.line + 1 : '?';
      const text = `L${row} ${label}: ${diagnostic.message}`;
      wrapText(text, contentWidth).forEach((line, index) => {
        lines.push(` ${index === 0 ? style.red(line) : style.dim(line)}`);
      });
    });
    if (diagnostics.length > shownDiagnostics.length) lines.push(style.dim(` … ${diagnostics.length - shownDiagnostics.length} more`));
  } else {
    lines.push(style.dim(' No diagnostics'));
  }

  return Array.from({ length: height }, (_, index) => padRendered(lines[index] || '', width));
}

function renderHelp() {
  const item = (key, action) => `${style.bold(key)} ${style.dim(action)}`;
  const binding = id => item(keybindings.helpLabel(id), keybindings.helpAction(id));
  if (openMode) return `${item('Enter', 'open')}  ${binding('cancel')}`;
  if (saveAsMode) return `${item('Enter', 'save')}  ${binding('cancel')}`;
  if (replaceMode) return `${item('Enter', 'accept')}  ${binding('cancel')}  ${item(keybindings.helpLabel('replace'), 'replace all')}  ${binding('search')}`;
  if (searchMode) return `${item('Enter', 'search')}  ${binding('cancel')}  ${binding('search')}  ${binding('nextMatch')}  ${binding('previousMatch')}`;
  if (treeSearchMode) return `${item('Enter', 'tree search')}  ${binding('cancel')}  ${item('Presets', 'functions/calls/classes')}  ${binding('nextMatch')}  ${binding('previousMatch')}`;
  return `${binding('save')}  ${binding('open')}  ${item('Ctrl+N/P', 'Next/Prev')}  ${binding('quit')}  ${binding('search')}  ${binding('replace')}  ${binding('tree')}  ${item('Ctrl+Space/F1', keybindings.helpAction('hover'))}`;
}

function render() {
  updateViewport();
  syncActiveBuffer();
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const { sidebarWidth, leftCols, visibleLines, gutterWidth, gutterLength, textWidth } = editorMetrics(rows, cols);
  const visibleText = Array.from({ length: visibleLines }, (_, index) => lines[viewportRow + index] || '');
  const sidebarLines = renderSidebarLines(visibleLines, sidebarWidth);
  const status = filePath ? path.relative(process.cwd(), filePath) : '[No file]';
  const totalLines = lines.length;
  const syntax = syntaxService.getBufferState(activeBuffer().id);
  const highlights = syntax ? syntax.highlights : [];
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
      const editorLine = padRendered(`${gutter}${renderDecoratedLine(line, absoluteRow, textWidth, highlights, viewportCol)}`, leftCols);
      return sidebarWidth ? `${editorLine}${style.dim('│')}${sidebarLines[index]}` : editorLine;
    }),
    separator(cols),
    renderPrompt(!sidebarWidth),
    renderHelp()
  ].join('\n');
  process.stdout.write(output);
  const promptRow = 5 + visibleText.length;
  let targetRow = 4 + (cursorRow - viewportRow);
  const cursorDisplayColumn = Math.max(0, display.textWidth(lines[cursorRow].slice(0, cursorCol)) - viewportCol);
  let targetCol = gutterLength + Math.min(cursorDisplayColumn, textWidth - 1) + 1;
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
    targetCol = 'Tree query/preset: '.length + treeQuery.length + 1;
  }
  process.stdout.write(`\u001b[${targetRow};${targetCol}H\u001b[?25h`);
}

function save(targetPath = filePath) {
  if (!targetPath) {
    return false;
  }
  saveFile(targetPath, lines);
  documentModel.markSaved(activeBuffer());
  dirty = activeBuffer().dirty;
  syncActiveBuffer();
  void lspManager.saveBuffer(activeBuffer());
  return true;
}

function saveAs(targetPath) {
  const resolved = saveAsFile(targetPath, lines);
  if (resolved) {
    documentModel.setBufferFilePath(activeBuffer(), resolved);
    documentModel.markSaved(activeBuffer());
    filePath = activeBuffer().filePath;
    dirty = activeBuffer().dirty;
    version = activeBuffer().version;
    refreshSyntax();
    syncActiveBuffer();
    void lspManager.openBuffer(activeBuffer()).then(() => lspManager.saveBuffer(activeBuffer()));
  }
  return resolved;
}

function quit() {
  if (quitting) return;
  quitting = true;
  Promise.race([
    lspManager.shutdown(),
    new Promise(resolve => setTimeout(resolve, 250)),
  ]).finally(finishQuit);
}

function finishQuit() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdout.write('\u001b[0m\u001b[?25h\u001b[?1049l\n');
  process.exit(0);
}

function requestQuit() {
  syncActiveBuffer();
  if (document.buffers.some(buffer => buffer.dirty) && !quitConfirm) {
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
  if (keybindings.matches('forceQuit', key)) {
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
    if (isTextKey(key)) {
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
    if (isTextKey(key)) {
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
    if (isTextKey(key)) {
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
    if (isTextKey(key)) {
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
    if (isTextKey(key)) {
      treeQuery += key.sequence;
      render();
      return;
    }
    return;
  }
  if (keybindings.matches('quit', key)) {
    requestQuit();
    return;
  }
  if (keybindings.matches('open', key)) {
    promptOpen();
    render();
    return;
  }
  if (keybindings.matches('nextBuffer', key)) {
    switchBuffer(1);
    render();
    return;
  }
  if (keybindings.matches('previousBuffer', key)) {
    switchBuffer(-1);
    render();
    return;
  }
  if (keybindings.matches('save', key)) {
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
  if (keybindings.matches('search', key)) {
    promptSearch();
    render();
    return;
  }
  if (keybindings.matches('replace', key)) {
    promptReplace();
    render();
    return;
  }
  if (keybindings.matches('tree', key)) {
    promptTreeSearch();
    render();
    return;
  }
  if (isHoverKey(key)) {
    void showHover();
    return;
  }
  if (keybindings.matches('nextMatch', key) || keybindings.matches('previousMatch', key)) {
    if (treeMatches.length) {
      if (keybindings.matches('previousMatch', key)) treeSearchPrevious();
      else treeSearchNext();
    } else if (keybindings.matches('previousMatch', key)) findPrevious();
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
  else if (isTextKey(key)) insertText(key.sequence);
  quitConfirm = false;
  clampCursor();
  syncActiveBuffer();
  render();
});

process.stdout.on('resize', render);

process.on('SIGINT', quit);
render();
