function createDiagnosticStore() {
  const diagnosticsByUri = new Map();

  function set(uri, diagnostics = [], version = null) {
    if (!uri) return [];
    const entries = diagnostics.map(diagnostic => ({ ...diagnostic }));
    diagnosticsByUri.set(uri, { version, diagnostics: entries });
    return entries;
  }

  function get(uri) {
    const entry = diagnosticsByUri.get(uri);
    return entry ? entry.diagnostics : [];
  }

  function clear(uri) {
    diagnosticsByUri.delete(uri);
  }

  function clearAll() {
    diagnosticsByUri.clear();
  }

  function count(uri) {
    return get(uri).length;
  }

  function forLine(uri, row) {
    return get(uri).filter(diagnostic => rangeContainsLine(diagnostic.range, row));
  }

  function forPosition(uri, row, col) {
    return get(uri).filter(diagnostic => rangeContainsPosition(diagnostic.range, row, col));
  }

  function summary(uri, row, col) {
    const positionDiagnostics = forPosition(uri, row, col);
    const lineDiagnostics = positionDiagnostics.length ? positionDiagnostics : forLine(uri, row);
    const diagnostic = lineDiagnostics[0];
    if (diagnostic) return `LSP ${severityLabel(diagnostic.severity)}: ${diagnostic.message}`;
    const total = count(uri);
    if (!total) return '';
    return `LSP ${total} diagnostic${total === 1 ? '' : 's'}`;
  }

  return {
    set,
    get,
    clear,
    clearAll,
    count,
    forLine,
    forPosition,
    summary,
  };
}

function severityLabel(severity) {
  if (severity === 1) return 'error';
  if (severity === 2) return 'warning';
  if (severity === 3) return 'info';
  if (severity === 4) return 'hint';
  return 'diagnostic';
}

function rangeContainsLine(range, row) {
  if (!range || !range.start || !range.end) return false;
  return row >= range.start.line && row <= range.end.line;
}

function rangeContainsPosition(range, row, col) {
  if (!rangeContainsLine(range, row)) return false;
  if (row === range.start.line && col < range.start.character) return false;
  if (row === range.end.line && col > range.end.character) return false;
  return true;
}

module.exports = {
  createDiagnosticStore,
  severityLabel,
};
