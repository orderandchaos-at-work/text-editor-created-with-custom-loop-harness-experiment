# Next steps

## Current implementation status

The editor now has the JavaScript syntax, document-model, LSP diagnostics, and LSP hover foundations in place.

Implemented:

- Core terminal editor with multiple buffers, open/save/save-as, search, replace, and Tree-sitter query search.
- JavaScript language detection for `.js`, `.jsx`, `.mjs`, and `.cjs`.
- Tree-sitter JavaScript parsing, syntax highlighting, syntax errors, and friendly AST search presets.
- Per-buffer syntax cache in `syntaxService.js`; render consumes prepared syntax state and does not parse every render.
- Multi-buffer state coverage for cursor, dirty state, save behavior, and syntax cache isolation.
- `documentModel.js` owns buffer/document helpers, text snapshots, position/offset conversion, versioning, dirty state, and normalized document open/change/save events.
- `lspClient.js` provides a minimal JSON-RPC/LSP client with fake-transport tests.
- JavaScript LSP diagnostics default to `typescript-language-server --stdio`, with `TEXT_EDITOR_JS_LSP` and `TEXT_EDITOR_JS_LSP_ARGS` available for overrides and `TEXT_EDITOR_JS_LSP=0` for opt-out.
- LSP lifecycle wiring sends `didOpen`, full-document `didChange`, `didSave`, and best-effort shutdown for configured JavaScript buffers.
- `textDocument/publishDiagnostics` notifications are stored per buffer URI and shown in the LSP sidebar for the active buffer when the terminal is wide enough, with a narrow-terminal status row fallback.
- `Ctrl+Space` requests `textDocument/hover` for the active JavaScript buffer and cursor position, with `F1` as a fallback for terminals or OS shortcuts that intercept `Ctrl+Space`.
- Hover requests show immediate loading feedback, then normalized readable text in the LSP sidebar, and clear after cursor movement or edits.
- Missing or unstartable LSP servers are handled without crashing the editor.

Current verification:

- `npm test` passes with fake LSP clients/transports and no required external language server.

## Completed follow-up: Manually QA JavaScript LSP hover

Hover is implemented with fake-client automated coverage and has now been verified with the real default JavaScript language server through `npm start`.

Verified behavior:

- `Ctrl+Space` requests `textDocument/hover` for the active JavaScript buffer and cursor position; `F1` works as a fallback if `Ctrl+Space` is intercepted.
- Hover uses the active buffer URI and zero-based cursor position.
- Hover runs when the default or overridden JavaScript LSP client is available.
- Disabled config, missing server, request errors, or empty hover responses do not crash or spam errors.
- Hover responses are normalized into readable sidebar text, with status-row fallback in narrow terminals.
- Hover text clears after cursor movement or edits.
- Diagnostics remain visible in the LSP sidebar independently of hover text.

## 1. Add go to definition

After hover is stable, add `textDocument/definition`.

Recommended first scope:

- Same-file jumps first.
- Then open target files when a definition points to another URI.
- Keep the current buffer/cursor history simple before adding jump-back support.

## 2. Improve diagnostic display

Diagnostics currently appear in the LSP sidebar when space is available. Next UI improvements can be incremental:

- Add simple gutter markers for lines with errors/warnings.
- Keep inline underlines for later because they must merge with syntax, search, and tree-search decorations.
- Preserve active-buffer diagnostic isolation.

## 3. Add completion UI

Completion is more UI-heavy than hover or definition.

Before implementing it, decide how the terminal popup/list should work:

- navigation keys
- filtering
- inserting plain text versus snippets
- cancellation on movement/edit
- display limits for small terminal windows

## 4. Consider incremental sync later

The editor currently uses full-document LSP sync. Keep it that way until the document model owns normalized edit application more completely.

Incremental sync should wait until edits flow through one model boundary that can emit reliable ranges and replacement text.

## 5. Continue editor polish

Remaining non-LSP polish:

- horizontal scrolling for long lines
- better Unicode display-width handling
- consolidated keybinding metadata for input handling, README controls, and help text
- broader language support only after the JavaScript LSP path remains stable

Before adding any dependency, verify CommonJS compatibility and keep the dependency set minimal.

See `docs/lsp-ast-syntax-plan.md` for the broader Tree-sitter and LSP integration plan.
