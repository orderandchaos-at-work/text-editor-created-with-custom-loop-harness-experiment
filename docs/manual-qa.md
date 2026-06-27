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

## Tree-sitter JavaScript support

- [ ] `npm install` has installed `tree-sitter` and `tree-sitter-javascript` before Tree-sitter QA starts.
- [ ] `npm test` passes with no skipped Tree-sitter runtime tests.
- [ ] Opening a `.js` file shows syntax highlighting when color is enabled.
- [ ] A valid `.js` file shows `AST ok` in the status row.
- [ ] A `.js` file with invalid syntax shows an AST syntax error count in the status row.
- [ ] Editing a `.js` file updates AST status and highlights after the edit.
- [ ] Switching between buffers keeps AST status/highlights associated with the correct buffer.
- [ ] `Ctrl+T` opens the tree query/preset prompt.
- [ ] Entering `(function_declaration name: (identifier) @function.name)` highlights matching JavaScript function names.
- [ ] Entering `functions` highlights function declarations.
- [ ] Entering `classes` highlights class declarations.
- [ ] Entering `imports` highlights import statements.
- [ ] Entering `calls` highlights call expressions.
- [ ] Entering `calls:foo` highlights calls to `foo` only.
- [ ] Entering `syntax-errors` highlights syntax error nodes.
- [ ] `Ctrl+G` jumps to the next tree query match.
- [ ] `Ctrl+Shift+G` jumps to the previous tree query match.
- [ ] `Esc` exits tree query mode without changing the current query results.
- [ ] A malformed tree query or preset shows a tree error in the status row without crashing.

## Optional JavaScript LSP diagnostics

- [ ] Running without LSP environment variables behaves normally and shows no LSP error spam.
- [ ] If installed, run `TEXT_EDITOR_JS_LSP=typescript-language-server TEXT_EDITOR_JS_LSP_ARGS="--stdio" npm start -- path/to/file.js`.
- [ ] Opening a `.js`, `.jsx`, `.mjs`, or `.cjs` file starts diagnostics without blocking editor startup.
- [ ] A JavaScript diagnostic appears in the status row after the language server responds.
- [ ] Moving the cursor to a line with diagnostics shows the first diagnostic for that line.
- [ ] Moving away from diagnostic lines shows the active buffer diagnostic count when diagnostics exist.
- [ ] Editing a JavaScript buffer updates diagnostics after full-document `didChange` sync.
- [ ] Saving a JavaScript buffer keeps the editor responsive and sends `didSave`.
- [ ] Save-as from an unnamed or differently named buffer to a JavaScript path opens the new URI and saves it.
- [ ] Switching buffers shows diagnostics only for the active buffer.
- [ ] Quitting attempts LSP shutdown and restores the terminal.
- [ ] Setting `TEXT_EDITOR_JS_LSP` to a missing command does not crash the editor.

## Rendering

- [ ] Header, tabs, line numbers, status row, and help row render clearly.
- [ ] Active buffer is visually distinct in the tab row.
- [ ] Active line marker follows the cursor.
- [ ] Terminal resize redraws the editor correctly.
- [ ] A small terminal window remains usable.
- [ ] Long lines are truncated without breaking layout.
- [ ] `NO_COLOR=1 npm start` disables color styling.
