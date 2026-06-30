# LSP, AST, syntax highlighting, and tree search plan

## Current editor constraints

The editor is a CommonJS Node.js terminal app. `index.js` still owns terminal input, rendering, buffers, prompts, and the current integration points, but pure editing/search behavior has started moving into helper modules. Text is stored as `lines: string[]`, which maps well to Tree-sitter parsing and LSP line/character positions.

The document model has been extracted so parsing and language services can consume normalized buffer state instead of terminal key handling. Incremental parsing should still wait until edit events carry reliable old/new ranges and replacement text.

## Current implementation status

Tree-sitter-first JavaScript support and the initial JavaScript LSP diagnostics/hover path are implemented and verified.

Implemented:

- `tree-sitter` and `tree-sitter-javascript` are declared in `package.json` and installed in the workspace.
- `syntaxService.js` detects JavaScript-like files, converts editor lines to parser text, parses JavaScript buffers, collects syntax errors, builds highlight spans, and runs Tree-sitter query searches.
- `syntaxService.js` maintains cached per-buffer syntax state containing language, parser, tree, version, errors, highlights, and query matches.
- Supported buffers are parsed when opened/created and reparsed after edits using full-buffer reparse.
- `index.js` renders cached Tree-sitter highlight spans, shows `AST ok` or an AST error count in the status row, and exposes tree query search with `Ctrl+T`.
- Rendering consumes cached syntax state instead of parsing during render.
- Tree query matches can be navigated with `Ctrl+G` and `Ctrl+Shift+G`.
- `Ctrl+T` accepts raw Tree-sitter queries and friendly presets such as `functions`, `classes`, `imports`, `calls`, `calls:<name>`, `variables`, and `syntax-errors`.
- JavaScript syntax highlighting covers representative imports/exports, declarations, calls, classes, properties, strings, template strings, regex literals, numbers, comments, constants, builtin variables, and safe operators.
- Multi-buffer state coverage verifies cursor, dirty state, save behavior, and syntax cache isolation.
- `documentModel.js` owns buffer/document helpers, text snapshots, position/offset conversion, versioning, dirty state, and normalized document open/change/save events.
- JavaScript LSP process management uses `typescript-language-server --stdio` by default, with environment overrides and opt-out support.
- LSP full-document sync sends `didOpen`, `didChange`, `didSave`, and best-effort shutdown for configured JavaScript buffers.
- LSP diagnostics are rendered in the sidebar for wide terminals with a narrow-terminal status row fallback.
- LSP hover is available with `Ctrl+Space` and `F1`, has been verified against the real default language server through `npm start`, and renders in the LSP sidebar.
- Jest tests cover language detection, line-to-text conversion, parsing, syntax errors, highlight captures, cached syntax state, raw queries, AST presets, and extracted search/replace helpers.

Verification:

- `npm test` passes with Tree-sitter, document model, and fake LSP coverage.

## Recommended architecture

Add three separate layers:

1. `documentModel.js`
   - Owns buffers, versions, dirty state, and edit application.
   - Emits normalized edit events with old/new ranges.
   - Provides helpers for full text, offset-to-position, and position-to-offset.

2. `syntaxService.js`
   - Uses Tree-sitter for parsing.
   - Maintains parser/tree state per supported buffer.
   - Provides highlight spans, syntax errors, symbols, and structural query results.
   - Currently uses full-buffer reparse; later it can use incremental edits once document edit events exist.

3. `lspClient.js`
   - Starts language server processes per language.
   - Sends `initialize`, `initialized`, `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didSave`, and `shutdown`.
   - Receives diagnostics and supports hover; later work adds completion, definition, references, rename, and formatting.

Rendering should consume decorations from the syntax and LSP layers rather than mixing parsing or protocol logic into the terminal renderer.

## AST and syntax highlighting

Use Tree-sitter first. It is a good fit because it is designed as an incremental parsing library, can build concrete syntax trees, and can update syntax trees efficiently as source changes. The Node binding supports parsing either a string or a custom callback, which fits the editor's `lines` array.

Current dependencies:

- `tree-sitter`
- `tree-sitter-javascript`

Current JavaScript path:

1. Detect language from file extension, initially `.js`, `.jsx`, `.mjs`, `.cjs`.
2. Create a Tree-sitter parser for JavaScript.
3. Parse supported buffers on open/create.
4. Reparse supported buffers after edits using full-buffer reparse.
5. Run highlight queries to produce ranges with capture names like `keyword`, `function`, `method`, `class`, `property`, `string`, `number`, `comment`, `constant`, `builtin`, and `operator`.
6. Map capture names to ANSI styles and apply highlighting during line rendering.

Later optimization:

- Add normalized edit events through the document model.
- Call `tree.edit(...)` with byte offsets and row/column points.
- Reparse with `parser.parse(newText, oldTree)`.

Do not do incremental parsing before the document model exists.

## Tree search

Use Tree-sitter queries for structural search. Tree-sitter queries use S-expression patterns that match syntax nodes and can capture nodes with names such as `@function` or `@call`.

Implemented UX:

- `Ctrl+T` opens tree search.
- Raw Tree-sitter query syntax is supported.
- Friendly presets are supported for common searches.
- Match count and current match status appear in the status row.
- `Ctrl+G` and `Ctrl+Shift+G` jump next/previous through tree matches.
- Current structural matches are highlighted in the buffer.

Implemented presets:

- `functions`
- `classes`
- `imports`
- `calls`
- `calls:<name>`
- `variables`
- `syntax-errors`

Example raw JavaScript queries:

```scheme
(function_declaration name: (identifier) @function.name)
(call_expression function: (identifier) @call.name)
(lexical_declaration (variable_declarator name: (identifier) @variable.name))
(ERROR) @syntax.error
```

Potential later presets:

- `methods`
- `exports`
- `constructors`
- `todos` from comments

## LSP

Use LSP after the document model exists. LSP gives editor features that Tree-sitter does not provide by itself: diagnostics, hover, completion, go-to-definition, references, rename, code actions, and formatting.

Suggested dependencies to verify before use:

- `vscode-jsonrpc` for the JSON-RPC transport over a spawned language-server process.
- `vscode-languageserver-protocol` for request/notification/type names.
- Optionally `vscode-languageserver-textdocument` if its document/version helpers are useful, though this editor may keep its own lightweight model.

Do not use `vscode-languageclient` first. It is oriented around VS Code extension clients and is heavier than this project needs.

Completed implementation outline:

1. Add an LSP client wrapper around `child_process.spawn` with byte-accurate JSON-RPC framing.
2. Configure JavaScript/TypeScript to use `typescript-language-server --stdio` by default, with environment overrides and opt-out support.
3. On editor start, initialize the server with workspace root and client capabilities, then send `initialized`.
4. On buffer open, send `textDocument/didOpen` with URI, language ID, version, and text.
5. On edit, increment the buffer version and send full-document `textDocument/didChange` for simplicity.
6. On save, send `textDocument/didSave`.
7. Render diagnostics in the LSP sidebar for wide terminals, with a status-row fallback for narrow terminals.
8. Add hover after diagnostics, rendering hover text in the LSP sidebar.

## Decision

Tree-sitter comes before LSP. Build local AST parsing, syntax highlighting, syntax-error detection, and structural search first; add LSP after the editor has a cleaner document model and Tree-sitter integration is stable.

## Feature order

Completed Tree-sitter baseline:

1. Add language detection and full-text helpers.
2. Add Tree-sitter JavaScript parsing with syntax-error detection.
3. Add syntax highlighting from Tree-sitter query captures.
4. Add per-buffer syntax state caching.
5. Add AST/tree search with raw query input.
6. Add friendly AST search presets.
7. Expand representative JavaScript highlighting.

Completed since the original next list:

1. Add automated coverage for buffer switching, dirty-state preservation, and multi-buffer syntax cache behavior.
2. Extract `documentModel.js` for buffers, versions, dirty state, full text, position/offset helpers, and edit application.
3. Add LSP process management and full-document sync.
4. Render LSP diagnostics.
5. Add hover.

Next:

1. Add go-to-definition for same-file jumps.
2. Add go-to-definition for cross-file targets.
3. Add jump-back history.
4. Improve diagnostics with gutter markers.
5. Optimize Tree-sitter incremental edit ranges after normalized edit events exist.
6. Design completion UI.
7. Implement completion.
8. Add references.
9. Add rename.
10. Add formatting.
11. Add more grammars and configurable language-server commands.

## Testing strategy

Automated tests currently cover the Tree-sitter baseline and extracted search/replace helpers.

Next automated tests:

- search/tree matches not bleeding between buffers
- normalized edit event generation
- go-to-definition request/response normalization with fake LSP clients
- completion request/response normalization and UI state transitions

Keep manual QA for terminal rendering, keybindings, and interactive language-server behavior.

## Open decisions

- Whether to keep using CommonJS or migrate to ESM before adding modern parser/LSP packages.
- Whether to vendor highlight queries or keep local minimal queries.
- How diagnostics and highlights should interact when ranges overlap.
