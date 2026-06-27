# LSP, AST, syntax highlighting, and tree search plan

## Current editor constraints

The editor is a CommonJS Node.js terminal app. `index.js` owns terminal input, rendering, buffers, search/replace prompts, and LSP/AST integration points would currently live there unless more state is extracted first. Text is stored as `lines: string[]`, which maps well to Tree-sitter's callback parser and LSP's line/character positions.

Before adding large features, finish extracting pure state helpers for search, replace, buffer state, and edits so parsing and language services can subscribe to a small set of document-change events instead of terminal key handling.

## Current implementation status

Tree-sitter-first implementation is partially in place.

Implemented:

- `tree-sitter` and `tree-sitter-javascript` are declared in `package.json` and `package-lock.json`.
- `syntaxService.js` detects JavaScript-like files, converts editor lines to parser text, parses JavaScript buffers, collects syntax errors, builds highlight spans, and runs raw Tree-sitter query searches.
- `index.js` renders Tree-sitter highlight spans, shows `AST ok` or an AST error count in the status row, and exposes raw tree query search with `Ctrl+T`.
- Tree query matches can be navigated with `Ctrl+G` and `Ctrl+Shift+G`.
- Jest tests cover language detection and line-to-text conversion; runtime Tree-sitter parse/highlight/query tests are present.

Verification gap:

- In the current workspace, `node_modules` does not contain the Tree-sitter packages, so runtime Tree-sitter tests are skipped by `syntaxService.isTreeSitterAvailable()`.
- `npm test` currently passes with 13 tests run and 2 Tree-sitter runtime tests skipped.
- The next verification step is to run `npm install`, confirm the Tree-sitter packages are present, then rerun `npm test` and ensure the skipped runtime tests execute.

## Recommended architecture

Add three separate layers:

1. `documentModel.js`
   - Owns buffers, versions, dirty state, and edit application.
   - Emits normalized edit events with old/new ranges.
   - Provides helpers for full text, offset-to-position, and position-to-offset.

2. `syntaxService.js`
   - Uses Tree-sitter for incremental parsing.
   - Maintains one parser/tree per supported language buffer.
   - Provides highlight spans, syntax errors, symbols, and structural query results.

3. `lspClient.js`
   - Starts language server processes per language.
   - Sends `initialize`, `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didSave`, and `shutdown`.
   - Receives diagnostics and later supports hover, completion, definition, rename, and formatting.

Rendering should consume decorations from the syntax and LSP layers rather than mixing parsing or protocol logic into the terminal renderer.

## AST and syntax highlighting

Use Tree-sitter first. It is a good fit because it is designed as an incremental parsing library, can build concrete syntax trees, and can update syntax trees efficiently as source changes. The Node binding supports parsing either a string or a custom callback, which fits the editor's `lines` array.

Suggested initial dependencies:

- `tree-sitter`
- `tree-sitter-javascript`

Start with JavaScript because this project is JavaScript and the grammar is available on npm.

Implementation outline:

1. Detect language from file extension, initially `.js`, `.jsx`, `.mjs`, `.cjs`.
2. Create a Tree-sitter parser for JavaScript.
3. Parse buffer text on open.
4. On edits, call `tree.edit(...)` with byte offsets and row/column points, then reparse with `parser.parse(newText, oldTree)`.
5. Run highlight queries to produce ranges with capture names like `keyword`, `function`, `type`, `property`, `string`, `number`, and `comment`.
6. Map capture names to existing ANSI styles and apply highlighting during line rendering.

The first version can reparse the full buffer after each edit if that is simpler. Keep the API shaped for incremental edits so it can be optimized without changing rendering later.

## Tree search

Use Tree-sitter queries for structural search. Tree-sitter queries use S-expression patterns that match syntax nodes and can capture nodes with names such as `@function` or `@call`.

Initial UX options:

- Add an AST search prompt separate from text search, for example `Ctrl+T`.
- Accept raw Tree-sitter query syntax at first.
- Show match count and jump next/previous through captured node start positions.
- Highlight the current structural match in the buffer.

Example JavaScript queries:

```scheme
(function_declaration name: (identifier) @function.name)
(call_expression function: (identifier) @call.name)
(lexical_declaration (variable_declarator name: (identifier) @variable.name))
(ERROR) @syntax.error
```

Later, add friendlier presets:

- `functions`
- `classes`
- `calls:<name>`
- `imports`
- `todos` from comments

## LSP

Use LSP after the document model exists. LSP gives editor features that Tree-sitter does not provide by itself: diagnostics, hover, completion, go-to-definition, references, rename, code actions, and formatting.

Suggested dependencies:

- `vscode-jsonrpc` for the JSON-RPC transport over a spawned language-server process.
- `vscode-languageserver-protocol` for request/notification/type names.
- Optionally `vscode-languageserver-textdocument` if its document/version helpers are useful, though this editor may keep its own lightweight model.

Do not use `vscode-languageclient` first. It is oriented around VS Code extension clients and is heavier than this project needs.

Implementation outline:

1. Add an LSP client wrapper around `child_process.spawn` and `vscode-jsonrpc/node` stream readers/writers.
2. Configure a server command per language. For JavaScript/TypeScript, this likely means a TypeScript language server wrapper such as `typescript-language-server --stdio`, but make it optional and user-configured rather than bundling it immediately.
3. On editor start, initialize the server with workspace root and client capabilities.
4. On buffer open, send `textDocument/didOpen` with URI, language ID, version, and text.
5. On edit, increment the buffer version and send `textDocument/didChange`. Start with full-document sync for simplicity.
6. On save, send `textDocument/didSave`.
7. Render diagnostics as gutter markers or a status-line message for the current line.
8. Add hover/completion/definition only after diagnostics are reliable.

## Decision

Tree-sitter comes before LSP. Build local AST parsing, syntax highlighting, syntax-error detection, and structural search first; add LSP after the editor has a cleaner document model and Tree-sitter integration is stable.

## Feature order

1. Finish editor state/document model extraction.
2. Add language detection and full-text/position helpers.
3. Add Tree-sitter JavaScript parsing with syntax-error detection.
4. Add syntax highlighting from Tree-sitter query captures.
5. Add AST/tree search with raw query input.
6. Add LSP process management and full-document sync.
7. Render LSP diagnostics.
8. Add hover, completion, go-to-definition, references, rename, and formatting.
9. Optimize Tree-sitter incremental edit ranges and LSP incremental sync.
10. Add more grammars and configurable language-server commands.

## Testing strategy

Add automated tests before wiring everything into terminal input:

- language detection by filename
- offset/position conversion across multiple lines
- normalized edit event generation
- Tree-sitter parse/highlight spans for a small JavaScript fixture
- structural query matches for functions/calls/imports
- LSP JSON-RPC message wrapper with a fake child process or fake connection

Keep manual QA for terminal rendering, keybindings, and interactive language-server behavior.

## Open decisions

- Whether to keep using CommonJS or migrate to ESM before adding modern parser/LSP packages.
- Whether to vendor highlight queries or read them from installed grammar packages.
- Whether to support raw Tree-sitter queries only, friendly presets only, or both.
- Which JavaScript language server command to recommend as the default.
- How diagnostics and highlights should interact when ranges overlap.
