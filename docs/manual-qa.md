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
- [ ] Replace current updates only the current match.
- [ ] Replace all updates every matching substring.

## Rendering

- [ ] Header, tabs, line numbers, status row, and help row render clearly.
- [ ] Active buffer is visually distinct in the tab row.
- [ ] Active line marker follows the cursor.
- [ ] Terminal resize redraws the editor correctly.
- [ ] A small terminal window remains usable.
- [ ] Long lines are truncated without breaking layout.
- [ ] `NO_COLOR=1 npm start` disables color styling.
