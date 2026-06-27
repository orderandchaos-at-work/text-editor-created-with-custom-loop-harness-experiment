# Next steps

## Current implementation status

Tree-sitter JavaScript support is now active in the workspace.

Implemented:

- `tree-sitter` and `tree-sitter-javascript` are installed and runtime tests execute.
- Search match calculation, search navigation, replace current, and replace all logic live in `editorState.js` with automated tests.
- JavaScript language detection supports `.js`, `.jsx`, `.mjs`, and `.cjs`.
- `syntaxService.js` maintains cached per-buffer syntax state with parser, tree, version, errors, highlights, and query matches.
- Supported buffers are parsed on open/create and refreshed after edits with full-buffer reparse.
- Rendering consumes cached syntax state instead of parsing during render.
- `Ctrl+T` supports raw Tree-sitter queries and friendly AST search presets.
- JavaScript syntax highlighting has expanded coverage for imports/exports, declarations, calls, classes, properties, literals, comments, constants, builtin variables, and safe operators.

Current verification:

- `npm test` passes with 30 tests and no skipped Tree-sitter runtime tests.

## 1. Stabilize and document the current app

The editor is already usable, so keep the current behavior easy to understand and verify.

- Keep `README.md` current with setup, usage, controls, and known limitations.
- Use `docs/manual-qa.md` for terminal behavior that is not covered by automated tests.
- Commit the current working state before larger refactors.

## 2. Expand automated tests around multi-buffer state

Jest coverage now includes file helpers, extracted editor state helpers, Tree-sitter parsing, syntax caching, AST presets, and representative highlight captures.

Remaining suggested coverage:

1. Buffer switching and cursor preservation.
2. Dirty-state preservation per buffer.
3. Save clearing dirty state for the saved buffer.
4. Syntax cache association with the correct buffer after switching.
5. Search and tree-query matches not bleeding between buffers.

Rationale: these are the behaviors most likely to regress during the next document-model refactor.

## 3. Extract a document model boundary

Add a small `documentModel.js` layer before LSP or incremental parsing work.

Responsibilities:

- Own buffers and the current buffer id.
- Track buffer versions and dirty state.
- Provide full text from `lines`.
- Convert position to offset and offset to position.
- Apply edits through helpers that can emit normalized edit events.

Rationale: Tree-sitter and future LSP integration should subscribe to document changes instead of terminal key handling.

## 4. Improve long-line handling

Choose a clear long-line strategy.

Recommended option: horizontal scrolling.

Rationale: horizontal scrolling fits a code-editor-style terminal UI better than soft wrapping and avoids changing document line structure during rendering.

## 5. Improve Unicode display handling

Plain string length does not always match terminal display width for emoji, CJK characters, and combining characters.

Before adding a dependency, verify CommonJS compatibility and keep runtime dependencies minimal.

## 6. Consolidate keybindings

Move keybinding metadata into one shared structure that can power both input handling and help text.

Rationale: this avoids documentation drift between actual behavior, the README, and the in-editor help row.

## 7. Continue language-aware editing

Tree-sitter remains the accepted first language-aware layer. The local AST path is now stable enough to build on.

Next candidates:

- Add more automated coverage for multi-buffer syntax state.
- Add more JavaScript AST presets if they are useful in daily editing.
- Add more languages only after the JavaScript path stays stable.
- Add incremental Tree-sitter parsing after normalized edit events exist.
- Add LSP later, after the document model is stable.

Before adding any new dependency, verify CommonJS compatibility and keep the dependency set minimal.

See `docs/lsp-ast-syntax-plan.md` for the broader Tree-sitter and LSP integration plan.
