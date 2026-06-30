const path = require('path');
const documentModel = require('./documentModel');

const javascriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const typescriptExtensions = new Set(['.ts', '.tsx']);

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

const typescriptHighlightQuery = `
(identifier) @variable
(property_identifier) @property
(function_declaration name: (identifier) @function)
(method_definition name: (property_identifier) @function.method)
(call_expression function: (identifier) @function.call)
(call_expression function: (member_expression property: (property_identifier) @function.method))
(class_declaration name: (type_identifier) @constructor)
(type_identifier) @type
(predefined_type) @type
(interface_declaration name: (type_identifier) @constructor)
(type_alias_declaration name: (type_identifier) @type)
[
  "abstract"
  "as"
  "async"
  "await"
  "class"
  "const"
  "declare"
  "enum"
  "export"
  "extends"
  "from"
  "function"
  "get"
  "if"
  "implements"
  "import"
  "in"
  "interface"
  "keyof"
  "let"
  "namespace"
  "new"
  "of"
  "override"
  "private"
  "protected"
  "public"
  "readonly"
  "return"
  "satisfies"
  "set"
  "static"
  "type"
  "typeof"
  "var"
  "void"
  "while"
  "yield"
] @keyword
(comment) @comment
(string) @string
(number) @number
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

const typescriptAstSearchPresets = {
  ...astSearchPresets,
  interfaces: `(interface_declaration name: (type_identifier) @interface.name)`,
  types: `(type_alias_declaration name: (type_identifier) @type.name)`,
};

let treeSitter;
const loadedLanguages = new Map();
const bufferStates = new Map();

function loadTreeSitter() {
  if (!treeSitter) treeSitter = require('tree-sitter');
  return treeSitter;
}

function languageDefinition(languageName) {
  if (languageName === 'javascript') {
    return { packageName: 'tree-sitter-javascript', exportName: null, highlightQuery, astSearchPresets };
  }
  if (languageName === 'typescript') {
    return { packageName: 'tree-sitter-typescript', exportName: 'typescript', highlightQuery: typescriptHighlightQuery, astSearchPresets: typescriptAstSearchPresets };
  }
  if (languageName === 'tsx') {
    return { packageName: 'tree-sitter-typescript', exportName: 'tsx', highlightQuery: typescriptHighlightQuery, astSearchPresets: typescriptAstSearchPresets };
  }
  return null;
}

function loadLanguage(languageName) {
  const Parser = loadTreeSitter();
  if (loadedLanguages.has(languageName)) return { Parser, language: loadedLanguages.get(languageName) };
  const definition = languageDefinition(languageName);
  if (!definition) throw new Error(`Unsupported language: ${languageName}`);
  const grammar = require(definition.packageName);
  const language = definition.exportName ? grammar[definition.exportName] : grammar;
  if (!language) throw new Error(`Missing Tree-sitter grammar export: ${definition.exportName || definition.packageName}`);
  loadedLanguages.set(languageName, language);
  return { Parser, language };
}

function isTreeSitterAvailable() {
  try {
    loadLanguage('javascript');
    return true;
  } catch (_) {
    return false;
  }
}

function isLanguageAvailable(languageName) {
  try {
    loadLanguage(languageName);
    return true;
  } catch (_) {
    return false;
  }
}

function detectLanguage(filePath) {
  if (!filePath) return null;
  const extension = path.extname(filePath).toLowerCase();
  if (javascriptExtensions.has(extension)) return 'javascript';
  if (typescriptExtensions.has(extension)) return extension === '.tsx' ? 'tsx' : 'typescript';
  return null;
}

function linesToText(lines) {
  return documentModel.linesToText(lines);
}

function parseWithLanguage(lines, languageName) {
  const { Parser, language } = loadLanguage(languageName);
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
  return resolveAstSearchInputForLanguage(trimmed, 'javascript');
}

function resolveAstSearchInputForLanguage(input, languageName) {
  const trimmed = input.trim();
  const presets = languageDefinition(languageName).astSearchPresets;
  if (presets[trimmed]) {
    return { querySource: presets[trimmed], preset: trimmed, error: null };
  }
  if (trimmed.startsWith('calls:')) {
    const name = trimmed.slice('calls:'.length).trim();
    if (!name) {
      return { querySource: null, preset: 'calls', error: 'Invalid AST preset: calls:<name> requires a name' };
    }
    return {
      querySource: presets.calls,
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
  return collectHighlights(parsed.language, parsed.tree, languageDefinition(parsed.languageName).highlightQuery, lines);
}

function parse(lines, filePath) {
  const languageName = detectLanguage(filePath);
  if (!languageName) {
    return emptySyntaxState(null, null, 0);
  }
  try {
    const result = parseWithLanguage(lines, languageName);
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
      highlights: collectHighlights(result.language, result.tree, languageDefinition(languageName).highlightQuery, lines),
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

function incrementalParse(state, lines, languageName, editEvent) {
  if (!state || state.languageName !== languageName || !state.available || !state.parser || !state.tree || !editEvent || !editEvent.treeEdit) return null;
  state.tree.edit(editEvent.treeEdit);
  return { parser: state.parser, tree: state.parser.parse(linesToText(lines), state.tree), language: state.language };
}

function updateBuffer(bufferId, lines, filePath, version, editEvent = null) {
  const languageName = detectLanguage(filePath);
  if (!languageName) {
    const state = emptySyntaxState(null, bufferId, version);
    bufferStates.delete(bufferId);
    return state;
  }
  try {
    const previousState = bufferStates.get(bufferId);
    const result = incrementalParse(previousState, lines, languageName, editEvent) || parseWithLanguage(lines, languageName);
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
      highlights: collectHighlights(result.language, result.tree, languageDefinition(languageName).highlightQuery, lines),
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
  const resolved = resolveAstSearchInputForLanguage(querySource, state.languageName);
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
  const resolved = resolveAstSearchInputForLanguage(querySource, languageName);
  if (resolved.error) {
    return { matches: [], error: resolved.error };
  }
  try {
    const result = parseWithLanguage(lines, languageName);
    return { matches: filterResolvedMatches(queryCaptures(result.language, result.tree, resolved.querySource, lines), resolved), error: null, preset: resolved.preset };
  } catch (error) {
    return { matches: [], error: error.message };
  }
}

module.exports = {
  detectLanguage,
  linesToText,
  isTreeSitterAvailable,
  isLanguageAvailable,
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
