function isCombiningMark(char) {
  const code = char.codePointAt(0);
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff) || (code >= 0x20d0 && code <= 0x20ff) || (code >= 0xfe20 && code <= 0xfe2f);
}

function nextColumn(line, col) {
  if (col >= line.length) return line.length;
  let next = col + Array.from(line.slice(col))[0].length;
  while (next < line.length) {
    const char = Array.from(line.slice(next))[0];
    if (!isCombiningMark(char)) break;
    next += char.length;
  }
  return next;
}

function previousColumn(line, col) {
  if (col <= 0) return 0;
  let previous = 0;
  for (let index = 0; index < col;) {
    previous = index;
    index = nextColumn(line, index);
  }
  return previous;
}

function createEditorState(lines = ['']) {
  return {
    lines: lines.length ? [...lines] : [''],
    cursorRow: 0,
    cursorCol: 0,
    dirty: false,
  };
}

function clampCursor(state) {
  if (state.cursorRow < 0) state.cursorRow = 0;
  if (state.cursorRow >= state.lines.length) state.cursorRow = state.lines.length - 1;
  if (state.cursorRow < 0) state.cursorRow = 0;
  const maxCol = state.lines[state.cursorRow] ? state.lines[state.cursorRow].length : 0;
  if (state.cursorCol < 0) state.cursorCol = 0;
  if (state.cursorCol > maxCol) state.cursorCol = maxCol;
  return state;
}

function moveLeft(state) {
  if (state.cursorCol > 0) state.cursorCol = previousColumn(state.lines[state.cursorRow], state.cursorCol);
  else if (state.cursorRow > 0) {
    state.cursorRow--;
    state.cursorCol = state.lines[state.cursorRow].length;
  }
  return state;
}

function moveRight(state) {
  if (state.cursorCol < state.lines[state.cursorRow].length) state.cursorCol = nextColumn(state.lines[state.cursorRow], state.cursorCol);
  else if (state.cursorRow < state.lines.length - 1) {
    state.cursorRow++;
    state.cursorCol = 0;
  }
  return state;
}

function moveUp(state) {
  if (state.cursorRow > 0) {
    state.cursorRow--;
    state.cursorCol = Math.min(state.cursorCol, state.lines[state.cursorRow].length);
  }
  return state;
}

function moveDown(state) {
  if (state.cursorRow < state.lines.length - 1) {
    state.cursorRow++;
    state.cursorCol = Math.min(state.cursorCol, state.lines[state.cursorRow].length);
  }
  return state;
}

function insertText(state, text) {
  const line = state.lines[state.cursorRow];
  state.lines[state.cursorRow] = line.slice(0, state.cursorCol) + text + line.slice(state.cursorCol);
  state.cursorCol += text.length;
  state.dirty = true;
  return state;
}

function insertNewline(state) {
  const line = state.lines[state.cursorRow];
  const left = line.slice(0, state.cursorCol);
  const right = line.slice(state.cursorCol);
  state.lines[state.cursorRow] = left;
  state.lines.splice(state.cursorRow + 1, 0, right);
  state.cursorRow++;
  state.cursorCol = 0;
  state.dirty = true;
  return state;
}

function backspace(state) {
  if (state.cursorCol > 0) {
    const line = state.lines[state.cursorRow];
    const previousCol = previousColumn(line, state.cursorCol);
    state.lines[state.cursorRow] = line.slice(0, previousCol) + line.slice(state.cursorCol);
    state.cursorCol = previousCol;
  } else if (state.cursorRow > 0) {
    const prev = state.lines[state.cursorRow - 1];
    const current = state.lines[state.cursorRow];
    state.cursorCol = prev.length;
    state.lines[state.cursorRow - 1] = prev + current;
    state.lines.splice(state.cursorRow, 1);
    state.cursorRow--;
  }
  state.dirty = true;
  return state;
}

function deleteForward(state) {
  const line = state.lines[state.cursorRow];
  if (state.cursorCol < line.length) {
    state.lines[state.cursorRow] = line.slice(0, state.cursorCol) + line.slice(nextColumn(line, state.cursorCol));
  } else if (state.cursorRow < state.lines.length - 1) {
    state.lines[state.cursorRow] = line + state.lines[state.cursorRow + 1];
    state.lines.splice(state.cursorRow + 1, 1);
  }
  state.dirty = true;
  return state;
}

function findSearchMatches(lines, query) {
  const matches = [];
  if (!query) return matches;
  for (let row = 0; row < lines.length; row++) {
    let start = 0;
    while (start <= lines[row].length) {
      const col = lines[row].indexOf(query, start);
      if (col === -1) break;
      matches.push({ row, col });
      start = col + Math.max(1, query.length);
    }
  }
  return matches;
}

function updateSearchMatches(state, query) {
  const matches = findSearchMatches(state.lines, query);
  if (!matches.length) return { matches, index: -1 };
  let index = matches.findIndex(match => match.row === state.cursorRow && match.col === state.cursorCol);
  if (index === -1) index = 0;
  state.cursorRow = matches[index].row;
  state.cursorCol = matches[index].col;
  return { matches, index };
}

function moveToSearchMatch(state, matches, index) {
  if (!matches.length || index < 0) return state;
  state.cursorRow = matches[index].row;
  state.cursorCol = matches[index].col;
  return state;
}

function nextSearchIndex(matches, index) {
  if (!matches.length) return -1;
  return (index + 1) % matches.length;
}

function previousSearchIndex(matches, index) {
  if (!matches.length) return -1;
  return (index - 1 + matches.length) % matches.length;
}

function replaceCurrent(state, matches, index, query, replacement) {
  if (!matches.length || index < 0 || !query) return false;
  const match = matches[index];
  const line = state.lines[match.row];
  state.lines[match.row] = line.slice(0, match.col) + replacement + line.slice(match.col + query.length);
  state.dirty = true;
  state.cursorRow = match.row;
  state.cursorCol = match.col + replacement.length;
  return true;
}

function replaceAll(state, query, replacement) {
  if (!query) return false;
  let changed = false;
  for (let row = 0; row < state.lines.length; row++) {
    if (state.lines[row].includes(query)) {
      state.lines[row] = state.lines[row].split(query).join(replacement);
      changed = true;
    }
  }
  if (changed) state.dirty = true;
  return changed;
}

module.exports = {
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
  nextColumn,
  previousColumn,
};
