# Manual QA checklist

Use this checklist after changes that affect terminal input, rendering, file operations, or editor state.

## Startup and shutdown

- [ ] Starts with an empty buffer using `npm start`.
- [ ] Opens an existing file using `npm start -- path/to/file.txt`.
- [ ] Opens multiple files using `npm start -- one.txt two.txt`.
- [ ] Opens a missing file as an empty buffer.
- [ ] `Ctrl+Q` quits cleanly when there are no unsaved changes.
- [ ] `Ctrl+Q` asks for confirmation when any buffer is modified.
- [ ] Pressing `Ctrl+Q` again quits after the unsaved-change warning.
- [ ] `Ctrl+C` force quits and restores the terminal.

## Editing

- [ ] Text input inserts characters at the cursor.
- [ ] `Enter` splits the current line.
- [ ] `Tab` inserts two spaces.
- [ ] Arrow keys move within and across lines.
- [ ] Arrow keys move across emoji, CJK characters, and combining-mark text without landing inside surrogate pairs.
- [ ] Cursor stays within valid line and column bounds.
- [ ] `Backspace` deletes within a line.
- [ ] `Backspace` at the start of a line joins with the previous line.
- [ ] `Delete` deletes within a line.
- [ ] `Delete` at the end of a line joins with the next line.

## Files and buffers

- [ ] `Ctrl+S` saves an existing file.
- [ ] `Ctrl+S` on an unnamed buffer prompts for save-as.
- [ ] Save-as creates nested parent directories.
- [ ] `Ctrl+O` opens another file.
- [ ] Opening an already-open file switches to its existing buffer.
- [ ] `Ctrl+N` switches to the next buffer.
- [ ] `Ctrl+P` switches to the previous buffer.
- [ ] Modified markers update correctly per buffer.

## Search and replace

- [ ] `Ctrl+F` opens search mode.
- [ ] Typing a search query jumps to the first match.
- [ ] `Ctrl+G` jumps to the next match.
- [ ] `Ctrl+Shift+G` jumps to the previous match.
- [ ] `Esc` exits search mode.
- [ ] `Ctrl+R` opens replace mode.
- [ ] Pressing `Enter` after the replace query advances to replacement text entry.
- [ ] Pressing `Enter` after replacement text updates only the current match.
- [ ] Pressing `Ctrl+R` after replacement text updates every matching substring.

## Tree-sitter JavaScript and TypeScript support

- [ ] `npm install` has installed `tree-sitter`, `tree-sitter-javascript`, and `tree-sitter-typescript` before Tree-sitter QA starts.
- [ ] `npm test` passes with no skipped Tree-sitter runtime tests.
- [ ] Opening a `.js` file shows syntax highlighting when color is enabled.
- [ ] Opening a `.ts` file shows syntax highlighting when color is enabled.
- [ ] Opening a `.tsx` file shows syntax highlighting when color is enabled.
- [ ] A valid `.js` file shows `AST ok` in the status row.
- [ ] A valid `.ts` or `.tsx` file shows `AST ok` in the status row.
- [ ] A `.js` file with invalid syntax shows an AST syntax error count in the status row.
- [ ] A `.ts` file with invalid syntax shows an AST syntax error count in the status row.
- [ ] Editing a `.js` file updates AST status and highlights after the edit.
- [ ] Editing a `.ts` or `.tsx` file updates AST status and highlights after the edit.
- [ ] Switching between buffers keeps AST status/highlights associated with the correct buffer.
- [ ] `Ctrl+T` opens the tree query/preset prompt.
- [ ] Entering `(function_declaration name: (identifier) @function.name)` highlights matching JavaScript function names.
- [ ] Entering `functions` highlights function declarations.
- [ ] Entering `classes` highlights class declarations.
- [ ] Entering `imports` highlights import statements.
- [ ] Entering `calls` highlights call expressions.
- [ ] Entering `calls:foo` highlights calls to `foo` only.
- [ ] In a TypeScript file, entering `interfaces` highlights interface declarations.
- [ ] In a TypeScript file, entering `types` highlights type aliases.
- [ ] Entering `syntax-errors` highlights syntax error nodes.
- [ ] `Ctrl+G` jumps to the next tree query match.
- [ ] `Ctrl+Shift+G` jumps to the previous tree query match.
- [ ] `Esc` exits tree query mode without changing the current query results.
- [ ] A malformed tree query or preset shows a tree error in the status row without crashing.

## JavaScript and TypeScript LSP diagnostics

- [ ] After `npm install`, running `npm start -- path/to/file.js` for a JavaScript file starts `typescript-language-server --stdio` without extra environment variables.
- [ ] After `npm install`, running `npm start -- path/to/file.ts` for a TypeScript file starts `typescript-language-server --stdio` without extra environment variables.
- [ ] Running with `TEXT_EDITOR_JS_LSP=0 npm start -- path/to/file.js` behaves normally and shows no LSP error spam.
- [ ] Running with `TEXT_EDITOR_TS_LSP=0 npm start -- path/to/file.ts` behaves normally and shows no LSP error spam.
- [ ] Setting `TEXT_EDITOR_JS_LSP` and `TEXT_EDITOR_JS_LSP_ARGS` overrides the default server command.
- [ ] Setting `TEXT_EDITOR_TS_LSP` and `TEXT_EDITOR_TS_LSP_ARGS` overrides the default TypeScript/TSX server command.
- [ ] Opening a `.js`, `.jsx`, `.mjs`, or `.cjs` file starts diagnostics without blocking editor startup.
- [ ] Opening a `.ts` or `.tsx` file starts diagnostics without blocking editor startup.
- [ ] A JavaScript diagnostic appears in the LSP sidebar after the language server responds when the terminal is wide enough.
- [ ] A TypeScript diagnostic appears in the LSP sidebar after the language server responds when the terminal is wide enough.
- [ ] The LSP sidebar shows server status, hover space, and an active-buffer diagnostics preview.
- [ ] In a narrow terminal, diagnostics fall back to the status row.
- [ ] Editing a JavaScript buffer updates diagnostics after full-document `didChange` sync.
- [ ] Saving a JavaScript buffer keeps the editor responsive and sends `didSave`.
- [ ] Save-as from an unnamed or differently named buffer to a JavaScript path opens the new URI and saves it.
- [ ] Save-as from an unnamed or differently named buffer to a TypeScript path opens the new URI and saves it.
- [ ] Switching buffers shows diagnostics only for the active buffer.
- [ ] Quitting attempts LSP shutdown and restores the terminal.
- [ ] Setting `TEXT_EDITOR_JS_LSP` to a missing command does not crash the editor.
- [ ] Setting `TEXT_EDITOR_TS_LSP` to a missing command does not crash the editor.

## JavaScript and TypeScript LSP hover

- [ ] After `npm install`, running `npm start -- path/to/file.js` for a JavaScript file enables hover without extra environment variables.
- [ ] After `npm install`, running `npm start -- path/to/file.ts` for a TypeScript file enables hover without extra environment variables.
- [ ] Running with `TEXT_EDITOR_JS_LSP=0 npm start -- path/to/file.js` behaves normally when pressing `Ctrl+Space` or `F1` and shows `LSP hover: not enabled`.
- [ ] Running with `TEXT_EDITOR_TS_LSP=0 npm start -- path/to/file.ts` behaves normally when pressing `Ctrl+Space` or `F1` and shows `LSP hover: not enabled`.
- [ ] Setting `TEXT_EDITOR_JS_LSP` and `TEXT_EDITOR_JS_LSP_ARGS` overrides the default server command.
- [ ] Setting `TEXT_EDITOR_TS_LSP` and `TEXT_EDITOR_TS_LSP_ARGS` overrides the default TypeScript/TSX server command.
- [ ] Place the cursor on a JavaScript symbol and press `Ctrl+Space`.
- [ ] Place the cursor on a TypeScript symbol or type and press `Ctrl+Space`.
- [ ] If `Ctrl+Space` does not show `LSP hover: loading`, try `F1` because some OS/terminal setups intercept `Ctrl+Space`.
- [ ] Hover text appears in the LSP sidebar after the loading state when the terminal is wide enough.
- [ ] In a narrow terminal, hover falls back to compact one-line status text.
- [ ] Pressing `Ctrl+Space` or `F1` on whitespace or a symbol without hover information does not crash.
- [ ] Moving the cursor clears the hover message from the sidebar.
- [ ] Editing clears the hover message and still sends diagnostics updates.
- [ ] Diagnostics remain visible in the sidebar after hover text is cleared.
- [ ] Setting `TEXT_EDITOR_JS_LSP` to a missing command does not crash the editor when pressing `Ctrl+Space` or `F1`.
- [ ] Setting `TEXT_EDITOR_TS_LSP` to a missing command does not crash the editor when pressing `Ctrl+Space` or `F1`.

## Rendering

- [ ] Header, tabs, line numbers, LSP sidebar, status row, and help row render clearly.
- [ ] Active buffer is visually distinct in the tab row.
- [ ] Active line marker follows the cursor.
- [ ] Terminal resize redraws the editor correctly.
- [ ] A small terminal window remains usable.
- [ ] Long lines scroll horizontally as the cursor moves past the right edge.
- [ ] Moving back toward the start of a long line scrolls horizontally left and keeps the cursor visible.
- [ ] Long highlighted search/tree/syntax spans remain aligned while horizontally scrolled.
- [ ] Emoji, CJK characters, and combining-mark text keep cursor placement and sidebar/status alignment usable.
- [ ] `NO_COLOR=1 npm start` disables color styling.

## Keybinding help consistency

- [ ] The normal-mode help row matches the Controls table in `README.md`.
- [ ] Search, replace, tree search, open, and save-as prompt help rows use the same key names as `README.md`.
- [ ] Existing keybindings from `keybindings.js` still perform their documented actions.
