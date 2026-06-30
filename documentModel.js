const path = require('path');

function normaliseLines(lines) {
  return lines && lines.length ? [...lines] : [''];
}

function languageIdForFilePath(filePath) {
  if (!filePath) return 'plaintext';
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') return 'javascript';
  if (extension === '.ts') return 'typescript';
  if (extension === '.tsx') return 'typescriptreact';
  return 'plaintext';
}

function filePathToUri(filePath) {
  if (!filePath) return null;
  let resolved = path.resolve(filePath).replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = `/${resolved}`;
  return `file://${encodeURI(resolved)}`;
}

function bufferUri(buffer) {
  return filePathToUri(buffer.filePath) || `untitled:${buffer.id}`;
}

function createBuffer(id, filePath = null, lines = ['']) {
  return {
    id,
    filePath,
    lines: normaliseLines(lines),
    cursorRow: 0,
    cursorCol: 0,
    viewportRow: 0,
    viewportCol: 0,
    dirty: false,
    version: 0,
  };
}

function createDocument(filePaths = [], loadLines = () => ['']) {
  let nextBufferId = 1;
  const paths = filePaths.length ? filePaths : [null];
  return {
    buffers: paths.map(filePath => createBuffer(nextBufferId++, filePath, loadLines(filePath))),
    activeBufferIndex: 0,
    nextBufferId,
  };
}

function activeBuffer(document) {
  return document.buffers[document.activeBufferIndex];
}

function switchBuffer(document, delta) {
  if (document.buffers.length < 2) return activeBuffer(document);
  document.activeBufferIndex = (document.activeBufferIndex + delta + document.buffers.length) % document.buffers.length;
  return activeBuffer(document);
}

function addBuffer(document, filePath, lines = ['']) {
  const buffer = createBuffer(document.nextBufferId++, filePath, lines);
  document.buffers.push(buffer);
  document.activeBufferIndex = document.buffers.length - 1;
  return buffer;
}

function findBufferIndex(document, filePath) {
  return document.buffers.findIndex(buffer => buffer.filePath === filePath);
}

function markChanged(buffer) {
  buffer.version++;
  buffer.dirty = true;
  return buffer;
}

function markSaved(buffer) {
  buffer.dirty = false;
  return buffer;
}

function setBufferFilePath(buffer, filePath) {
  buffer.filePath = filePath;
  buffer.version++;
  return buffer;
}

function linesToText(lines) {
  return normaliseLines(lines).join('\n');
}

function documentSnapshot(buffer) {
  return {
    bufferId: buffer.id,
    uri: bufferUri(buffer),
    filePath: buffer.filePath,
    languageId: languageIdForFilePath(buffer.filePath),
    version: buffer.version,
    text: linesToText(buffer.lines),
  };
}

function documentChangeEvent(buffer, reason = 'change') {
  const snapshot = documentSnapshot(buffer);
  return {
    type: 'documentChange',
    reason,
    ...snapshot,
    contentChanges: [{ text: snapshot.text }],
  };
}

function documentOpenEvent(buffer) {
  return {
    type: 'documentOpen',
    ...documentSnapshot(buffer),
  };
}

function documentSaveEvent(buffer) {
  return {
    type: 'documentSave',
    ...documentSnapshot(buffer),
  };
}

function documentPositionParams(buffer, row, col) {
  return {
    textDocument: {
      uri: bufferUri(buffer),
    },
    position: {
      line: row,
      character: col,
    },
  };
}

function positionToOffset(lines, row, col) {
  const safeLines = normaliseLines(lines);
  const safeRow = Math.max(0, Math.min(row, safeLines.length - 1));
  const safeCol = Math.max(0, Math.min(col, safeLines[safeRow].length));
  let offset = 0;
  for (let index = 0; index < safeRow; index++) {
    offset += safeLines[index].length + 1;
  }
  return offset + safeCol;
}

function offsetToPosition(lines, offset) {
  const safeLines = normaliseLines(lines);
  let remaining = Math.max(0, offset);
  for (let row = 0; row < safeLines.length; row++) {
    if (remaining <= safeLines[row].length) {
      return { row, col: remaining };
    }
    remaining -= safeLines[row].length + 1;
  }
  const lastRow = safeLines.length - 1;
  return { row: lastRow, col: safeLines[lastRow].length };
}

module.exports = {
  createBuffer,
  createDocument,
  activeBuffer,
  switchBuffer,
  addBuffer,
  findBufferIndex,
  markChanged,
  markSaved,
  setBufferFilePath,
  linesToText,
  languageIdForFilePath,
  filePathToUri,
  bufferUri,
  documentSnapshot,
  documentChangeEvent,
  documentOpenEvent,
  documentSaveEvent,
  documentPositionParams,
  positionToOffset,
  offsetToPosition,
};
