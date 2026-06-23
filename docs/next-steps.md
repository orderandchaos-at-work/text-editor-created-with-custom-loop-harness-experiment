# Next steps

## 1. Stabilize and document the current app

The editor is already usable, so the first priority is to make the current behavior easy to understand and verify.

- Keep `README.md` current with setup, usage, controls, and known limitations.
- Use `docs/manual-qa.md` for terminal behavior that is not covered by automated tests.
- Commit the current working state before larger refactors.

## 2. Extract pure editor state logic

Move editing behavior out of `index.js` into a testable module such as `editorState.js`.

Good candidates:

- Cursor movement
- Character insertion
- Newline insertion
- Backspace and delete behavior
- Search match calculation and navigation
- Replace current and replace all
- Buffer switching and dirty-state tracking

Rationale: `index.js` should mostly handle terminal I/O and rendering. Pure state logic is easier to test, debug, and change safely.

## 3. Expand automated tests

After extracting state logic, add Jest coverage for core editor behavior.

Suggested order:

1. Cursor movement bounds
2. Text insertion and newline splitting
3. Backspace and delete within/across lines
4. Search match discovery and next/previous navigation
5. Replace current and replace all
6. Buffer switching and dirty-state preservation

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
