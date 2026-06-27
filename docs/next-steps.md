# Next steps

## Immediate AST/Tree-sitter milestone

1. Run `npm install`.
2. Run `npm test`.
3. Confirm the Tree-sitter runtime tests execute instead of being skipped.
4. Fix any dependency, install, or runtime test issues before adding features.
5. Extract search match calculation, search navigation, replace current, and replace all logic from `index.js` into testable editor state helpers.
6. Add automated tests for search match discovery, next/previous search navigation, replace current, and replace all.
7. Cache parsed Tree-sitter trees per buffer instead of parsing during render; start with full-buffer reparse on edit, keeping the API compatible with later incremental parsing.
8. Keep Tree-sitter as the first language-aware layer. Add LSP later, after the local AST path and document model are stable.
9. Before adding any new dependency, verify CommonJS compatibility and keep the dependency set minimal.

## 1. Stabilize and document the current app

The editor is already usable, so the first priority is to make the current behavior easy to understand and verify.

- Keep `README.md` current with setup, usage, controls, and known limitations.
- Use `docs/manual-qa.md` for terminal behavior that is not covered by automated tests.
- Commit the current working state before larger refactors.

## 2. Extract pure editor state logic

Editing behavior has started moving out of `index.js` into `editorState.js`.

Currently extracted:

- Cursor movement
- Character insertion
- Newline insertion
- Backspace and delete behavior

Remaining candidates:

- Search match calculation and navigation
- Replace current and replace all
- Buffer switching and dirty-state tracking

Rationale: `index.js` should mostly handle terminal I/O and rendering. Pure state logic is easier to test, debug, and change safely.

## 3. Expand automated tests

Jest coverage now includes file helpers and the extracted editor state helpers.

Remaining suggested coverage:

1. Search match discovery and next/previous navigation
2. Replace current and replace all
3. Buffer switching and dirty-state preservation

Rationale: these are the behaviors most likely to regress during refactoring or feature work.

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

## 7. Add language-aware editing

Tree-sitter is the accepted first step, and the initial JavaScript support is now implemented with `tree-sitter` and `tree-sitter-javascript`.

Currently implemented:

- JavaScript language detection for `.js`, `.jsx`, `.mjs`, and `.cjs`
- Tree-sitter AST parsing through `syntaxService.js`
- Syntax error collection for parsed JavaScript buffers
- Tree-sitter-based syntax highlighting in the terminal renderer
- Raw Tree-sitter query search from `Ctrl+T`
- Automated syntax service tests

Current verification note:

- `npm test` passes in this workspace, but the Tree-sitter runtime tests are skipped because the Tree-sitter packages are not currently installed under `node_modules`.
- Run `npm install`, then rerun `npm test` and confirm the Tree-sitter parse/highlight/query tests execute before treating this feature as complete.

Remaining candidates:

- Verify installed Tree-sitter runtime dependencies in the workspace
- Cache parsed trees per buffer instead of parsing during render
- Add friendly structural search presets on top of raw Tree-sitter queries
- Expand highlighting captures and tune colors
- Add more languages after the JavaScript path is stable
- Add LSP later, after the local AST path is mature

See `docs/lsp-ast-syntax-plan.md` for the researched plan to add broader Tree-sitter support and later LSP integration.
