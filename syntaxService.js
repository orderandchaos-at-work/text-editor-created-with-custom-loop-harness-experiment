const path = require('path');
const documentModel = require('./documentModel');

const javascriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const highlightQuery = `
(identifier) @variable
(property_identifier) @property
(function_declaration name: (identifier) @function)
(function_expression name: (identifier) @function)
(method_definition name: (property_identifier) @function.method)
(variable_declarator name: (identifier) @function value: [(arrow_function) (function_expression)])
(lexical_declaration kind: "const" (variable_declarator name: (identifier) @constant))
(call_expression function: (identifier) @function.call)
(call_expression function: (member_expression property: (property_identifier) @function.method))
(class_declaration name: (identifier) @constructor)
(class name: (identifier) @constructor)
(this) @variable.builtin
(super) @variable.builtin
[
  (true)
  (false)
  (null)
  (undefined)
] @constant.builtin
(comment) @comment
(string) @string
(template_string) @string
(regex) @string.special
(number) @number
[
  "as"
  "async"
  "await"
  "break"
  "case"
  "catch"
  "class"
  "const"
  "continue"
  "debugger"
  "default"
  "delete"
  "do"
  "else"
  "export"
  "extends"
  "finally"
  "for"
  "from"
  "function"
  "get"
  "if"
  "import"
  "in"
  "instanceof"
  "let"
  "new"
  "of"
  "return"
  "set"
  "static"
  "switch"
  "target"
  "throw"
  "try"
  "typeof"
  "var"
  "void"
  "while"
  "with"
  "yield"
] @keyword
[
  "-"
  "--"
  "-="
  "+"
  "++"
  "+="
  "*"
  "*="
  "**"
  "**="
  "/"
  "/="
  "%"
  "%="
  "<"
  "<="
  "<<"
  "<<="
  "="
  "=="
  "==="
  "!"
  "!="
  "!=="
  "=>"
  ">"
  ">="
  ">>"
  ">>="
  ">>>"
  ">>>="
  "~"
  "^"
  "&"
  "|"
  "^="
  "&="
  "|="
  "&&"
  "||"
  "??"
  "&&="
  "||="
  "??="
  (optional_chain)
] @operator
(ERROR) @error
`;

const astSearchPresets = {
  functions: `[
    (function_declaration name: (identifier) @function.name)
    (method_definition name: (property_identifier) @function.name)
    (variable_declarator name: (identifier) @function.name value: [(arrow_function) (function_expression)])
  ]`,
  classes: `[
    (class_declaration name: (identifier) @class.name)
    (class name: (identifier) @class.name)
  ]`,
  imports: `(import_statement) @import`,
  calls: `[
    (call_expression function: (identifier) @call.name)
    (call_expression function: (member_expression property: (property_identifier) @call.name))
  ]`,
  variables: `(variable_declarator name: (identifier) @variable.name)`,
  'syntax-errors': `(ERROR) @syntax.error`,
};

let treeSitter;
let javascriptLanguage;
const bufferStates = new Map();

function loadTreeSitter() {
  if (treeSitter && javascriptLanguage) {
    return { Parser: treeSitter, language: javascriptLanguage };
  }
  treeSitter = require('tree-sitter');
  javascriptLanguage = require('tree-sitter-javascript');
  return { Parser: treeSitter, language: javascriptLanguage };
}

function isTreeSitterAvailable() {
  try {
    loadTreeSitter();
    return true;
  } catch (_) {
    return false;
  }
}

function detectLanguage(filePath) {
  if (!filePath) return null;
  return javascriptExtensions.has(path.extname(filePath).toLowerCase()) ? 'javascript' : null;
}

function linesToText(lines) {
  return documentModel.linesToText(lines);
}

function parseJavaScript(lines) {
  const { Parser, language } = loadTreeSitter();
  const parser = new Parser();
  parser.setLanguage(language);
  return { parser, tree: parser.parse(linesToText(lines)), language };
}

function walk(node, visit) {
  visit(node);
  for (let index = 0; index < node.namedChildCount; index++) {
    walk(node.namedChild(index), visit);
  }
}

function byteColumnToIndex(line, byteColumn) {
  let bytes = 0;
  for (let index = 0; index < line.length;) {
    if (bytes >= byteColumn) return index;
    const char = Array.from(line.slice(index))[0];
    const nextBytes = bytes + Buffer.byteLength(char, 'utf8');
    if (nextBytes > byteColumn) return index;
    bytes = nextBytes;
    index += char.length;
  }
  return line.length;
}

function resolveStartColumn(line, column, text) {
  const firstLineText = String(text || '').split('\n')[0];
  if (column <= line.length && (!firstLineText || line.slice(column).startsWith(firstLineText))) return column;
  return byteColumnToIndex(line, column);
}

function resolveEndColumn(line, column, start, text) {
  const lineText = String(text || '').split('\n').pop();
  if (column <= line.length && line.slice(start, column).endsWith(lineText)) return column;
  return byteColumnToIndex(line, column);
}

function collectSyntaxErrors(tree, lines) {
  const errors = [];
  walk(tree.rootNode, node => {
    if (node.type === 'ERROR' || node.isError || node.isMissing) {
      errors.push(nodeToRange(node, 'syntax.error', lines));
    }
  });
  return errors;
}

function nodeToRange(node, capture, lines) {
  const startLine = lines && lines[node.startPosition.row] ? lines[node.startPosition.row] : '';
  const endLine = lines && lines[node.endPosition.row] ? lines[node.endPosition.row] : '';
  const col = lines ? resolveStartColumn(startLine, node.startPosition.column, node.text) : node.startPosition.column;
  return {
    capture,
    row: node.startPosition.row,
    col,
    endRow: node.endPosition.row,
    endCol: lines ? resolveEndColumn(endLine, node.endPosition.column, node.startPosition.row === node.endPosition.row ? col : 0, node.text) : node.endPosition.column,
    text: node.text,
    nodeType: node.type,
  };
}

function queryCaptures(language, tree, querySource, lines) {
  const query = new treeSitter.Query(language, querySource);
  return query.captures(tree.rootNode).map(capture => nodeToRange(capture.node, capture.name, lines));
}

function collectHighlights(language, tree, querySource = highlightQuery, lines = null) {
  try {
    return queryCaptures(language, tree, querySource, lines);
  } catch (_) {
    return [];
  }
}

function resolveAstSearchInput(input) {
  const trimmed = input.trim();
  if (astSearchPresets[trimmed]) {
    return { querySource: astSearchPresets[trimmed], preset: trimmed, error: null };
  }
  if (trimmed.startsWith('calls:')) {
    const name = trimmed.slice('calls:'.length).trim();
    if (!name) {
      return { querySource: null, preset: 'calls', error: 'Invalid AST preset: calls:<name> requires a name' };
    }
    return {
      querySource: astSearchPresets.calls,
      preset: 'calls',
      filter: { capture: 'call.name', text: name },
      error: null,
    };
  }
  return { querySource: input, preset: null, error: null };
}

function filterResolvedMatches(matches, resolved) {
  if (!resolved.filter) return matches;
  return matches.filter(match => match.capture === resolved.filter.capture && match.text === resolved.filter.text);
}

function highlight(lines, filePath) {
  const parsed = parse(lines, filePath);
  if (!parsed.tree) return [];
  return collectHighlights(parsed.language, parsed.tree, highlightQuery, lines);
}

function parse(lines, filePath) {
  const languageName = detectLanguage(filePath);
  if (!languageName) {
    return emptySyntaxState(null, null, 0);
  }
  try {
    const result = parseJavaScript(lines);
    return {
      supported: true,
      available: true,
      languageName,
      parser: result.parser,
      tree: result.tree,
      language: result.language,
      version: 0,
      lines,
      errors: collectSyntaxErrors(result.tree, lines),
      highlights: collectHighlights(result.language, result.tree, highlightQuery, lines),
      queryMatches: [],
    };
  } catch (error) {
    return {
      supported: true,
      available: false,
      languageName,
      parser: null,
      tree: null,
      version: 0,
      errors: [],
      highlights: [],
      queryMatches: [],
      error: error.message,
    };
  }
}

function emptySyntaxState(languageName, bufferId, version) {
  return {
    bufferId,
    supported: Boolean(languageName),
    available: false,
    languageName,
    language: null,
    parser: null,
    tree: null,
    version,
    lines: [],
    errors: [],
    highlights: [],
    queryMatches: [],
  };
}

function updateBuffer(bufferId, lines, filePath, version) {
  const languageName = detectLanguage(filePath);
  if (!languageName) {
    const state = emptySyntaxState(null, bufferId, version);
    bufferStates.delete(bufferId);
    return state;
  }
  try {
    const result = parseJavaScript(lines);
    const state = {
      bufferId,
      supported: true,
      available: true,
      languageName,
      language: result.language,
      parser: result.parser,
      tree: result.tree,
      version,
      lines,
      errors: collectSyntaxErrors(result.tree, lines),
      highlights: collectHighlights(result.language, result.tree, highlightQuery, lines),
      queryMatches: [],
    };
    bufferStates.set(bufferId, state);
    return state;
  } catch (error) {
    const state = emptySyntaxState(languageName, bufferId, version);
    state.supported = true;
    state.error = error.message;
    bufferStates.set(bufferId, state);
    return state;
  }
}

function getBufferState(bufferId) {
  return bufferStates.get(bufferId) || null;
}

function clearBuffer(bufferId) {
  bufferStates.delete(bufferId);
}

function treeSearchBuffer(bufferId, querySource) {
  const state = getBufferState(bufferId);
  if (!state || !state.available || !querySource) {
    return { matches: [], error: null };
  }
  const resolved = resolveAstSearchInput(querySource);
  if (resolved.error) {
    state.queryMatches = [];
    return { matches: [], error: resolved.error };
  }
  try {
    state.queryMatches = filterResolvedMatches(queryCaptures(state.language, state.tree, resolved.querySource, state.lines), resolved);
    return { matches: state.queryMatches, error: null, preset: resolved.preset };
  } catch (error) {
    state.queryMatches = [];
    return { matches: [], error: error.message };
  }
}

function treeSearch(lines, filePath, querySource) {
  const languageName = detectLanguage(filePath);
  if (!languageName || !querySource) {
    return { matches: [], error: null };
  }
  const resolved = resolveAstSearchInput(querySource);
  if (resolved.error) {
    return { matches: [], error: resolved.error };
  }
  try {
    const result = parseJavaScript(lines);
    return { matches: filterResolvedMatches(queryCaptures(result.language, result.tree, resolved.querySource, lines), resolved), error: null, preset: resolved.preset };
  } catch (error) {
    return { matches: [], error: error.message };
  }
}

module.exports = {
  detectLanguage,
  linesToText,
  isTreeSitterAvailable,
  parse,
  highlight,
  treeSearch,
  updateBuffer,
  getBufferState,
  clearBuffer,
  treeSearchBuffer,
  resolveAstSearchInput,
  collectHighlights,
};
