const path = require('path');

function normaliseLines(lines) {
  return lines && lines.length ? [...lines] : [''];
}

function languageIdForFilePath(filePath) {
  if (!filePath) return 'plaintext';
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') return 'javascript';
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

function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

function positionToByteOffset(lines, row, col) {
  const safeLines = normaliseLines(lines);
  const safeRow = Math.max(0, Math.min(row, safeLines.length - 1));
  const safeCol = Math.max(0, Math.min(col, safeLines[safeRow].length));
  let offset = 0;
  for (let index = 0; index < safeRow; index++) {
    offset += byteLength(safeLines[index]) + 1;
  }
  return offset + byteLength(safeLines[safeRow].slice(0, safeCol));
}

function positionToPoint(lines, row, col) {
  const safeLines = normaliseLines(lines);
  const safeRow = Math.max(0, Math.min(row, safeLines.length - 1));
  const safeCol = Math.max(0, Math.min(col, safeLines[safeRow].length));
  return {
    row: safeRow,
    column: byteLength(safeLines[safeRow].slice(0, safeCol)),
  };
}

function byteOffsetToPosition(lines, byteOffset) {
  const safeLines = normaliseLines(lines);
  let remaining = Math.max(0, byteOffset);
  for (let row = 0; row < safeLines.length; row++) {
    const lineBytes = byteLength(safeLines[row]);
    if (remaining <= lineBytes) {
      let bytes = 0;
      for (let col = 0; col < safeLines[row].length;) {
        const char = Array.from(safeLines[row].slice(col))[0];
        const nextBytes = bytes + byteLength(char);
        if (nextBytes > remaining) return { row, col };
        bytes = nextBytes;
        col += char.length;
        if (bytes === remaining) return { row, col };
      }
      return { row, col: safeLines[row].length };
    }
    remaining -= lineBytes + 1;
  }
  const lastRow = safeLines.length - 1;
  return { row: lastRow, col: safeLines[lastRow].length };
}

function offsetToByteOffset(lines, offset) {
  return byteLength(linesToText(lines).slice(0, Math.max(0, offset)));
}

function normalizedEditEvent(oldLines, newLines) {
  const oldText = linesToText(oldLines);
  const newText = linesToText(newLines);
  if (oldText === newText) return null;
  let startOffset = 0;
  while (startOffset < oldText.length && startOffset < newText.length && oldText[startOffset] === newText[startOffset]) {
    startOffset++;
  }
  let unchangedSuffix = 0;
  while (
    unchangedSuffix < oldText.length - startOffset &&
    unchangedSuffix < newText.length - startOffset &&
    oldText[oldText.length - 1 - unchangedSuffix] === newText[newText.length - 1 - unchangedSuffix]
  ) {
    unchangedSuffix++;
  }
  const oldEndOffset = oldText.length - unchangedSuffix;
  const newEndOffset = newText.length - unchangedSuffix;
  const start = offsetToPosition(oldLines, startOffset);
  const oldEnd = offsetToPosition(oldLines, oldEndOffset);
  const newStart = offsetToPosition(newLines, startOffset);
  const newEnd = offsetToPosition(newLines, newEndOffset);
  const startIndex = offsetToByteOffset(oldLines, startOffset);
  const oldEndIndex = offsetToByteOffset(oldLines, oldEndOffset);
  const newEndIndex = offsetToByteOffset(newLines, newEndOffset);
  const edit = {
    oldRange: { start, end: oldEnd, startOffset, endOffset: oldEndOffset, startByte: startIndex, endByte: oldEndIndex },
    newRange: { start: newStart, end: newEnd, startOffset, endOffset: newEndOffset, startByte: startIndex, endByte: newEndIndex },
    replacementText: newText.slice(startOffset, newEndOffset),
    startIndex,
    oldEndIndex,
    newEndIndex,
    startPosition: positionToPoint(oldLines, start.row, start.col),
    oldEndPosition: positionToPoint(oldLines, oldEnd.row, oldEnd.col),
    newEndPosition: positionToPoint(newLines, newEnd.row, newEnd.col),
  };
  edit.treeEdit = {
    startIndex: edit.startIndex,
    oldEndIndex: edit.oldEndIndex,
    newEndIndex: edit.newEndIndex,
    startPosition: edit.startPosition,
    oldEndPosition: edit.oldEndPosition,
    newEndPosition: edit.newEndPosition,
  };
  return edit;
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
  positionToByteOffset,
  positionToPoint,
  byteOffsetToPosition,
  normalizedEditEvent,
};
