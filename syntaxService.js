const path = require('path');

const javascriptExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const highlightQuery = `
[
  "function"
  "return"
  "const"
  "let"
  "var"
  "class"
  "import"
  "export"
  "from"
  "if"
  "else"
  "for"
  "while"
] @keyword
(comment) @comment
(string) @string
(template_string) @string
(number) @number
(function_declaration name: (identifier) @function)
(call_expression function: (identifier) @function)
(pair key: (property_identifier) @property)
(ERROR) @error
`;

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
  return lines.join('\n');
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

function collectSyntaxErrors(tree) {
  const errors = [];
  walk(tree.rootNode, node => {
    if (node.type === 'ERROR' || node.isError || node.isMissing) {
      errors.push(nodeToRange(node, 'syntax.error'));
    }
  });
  return errors;
}

function nodeToRange(node, capture) {
  return {
    capture,
    row: node.startPosition.row,
    col: node.startPosition.column,
    endRow: node.endPosition.row,
    endCol: node.endPosition.column,
    text: node.text,
    nodeType: node.type,
  };
}

function queryCaptures(language, tree, querySource) {
  const query = new treeSitter.Query(language, querySource);
  return query.captures(tree.rootNode).map(capture => nodeToRange(capture.node, capture.name));
}

function highlight(lines, filePath) {
  const parsed = parse(lines, filePath);
  if (!parsed.tree) return [];
  try {
    return queryCaptures(parsed.language, parsed.tree, highlightQuery);
  } catch (_) {
    return [];
  }
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
      errors: collectSyntaxErrors(result.tree),
      highlights: queryCaptures(result.language, result.tree, highlightQuery),
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
      errors: collectSyntaxErrors(result.tree),
      highlights: queryCaptures(result.language, result.tree, highlightQuery),
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
  try {
    state.queryMatches = queryCaptures(state.language, state.tree, querySource);
    return { matches: state.queryMatches, error: null };
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
  try {
    const result = parseJavaScript(lines);
    return { matches: queryCaptures(result.language, result.tree, querySource), error: null };
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
};
