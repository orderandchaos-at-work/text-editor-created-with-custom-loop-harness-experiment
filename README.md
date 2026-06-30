# text-editor

A small terminal text editor built with Node.js. It opens in an alternate terminal screen, supports multiple buffers, and provides basic editing, search, replace, open, save, save-as, and JavaScript/TypeScript Tree-sitter workflows.

## Requirements

- Node.js
- npm

## Install

```bash
npm install
```

## Run

Start with an empty buffer:

```bash
npm start
```

Open one or more files:

```bash
npm start -- notes.txt src/example.js
```

Files that do not exist are opened as empty buffers and can be saved later.

## Test

```bash
npm test
```

Automated tests cover file helper behavior, pure editor state helpers, Unicode display-width helpers, keybinding metadata, and the Tree-sitter syntax service, including AST parsing, syntax highlighting, tree search, and syntax cache behavior. Interactive terminal behavior is covered by the manual QA checklist in `docs/manual-qa.md`.

LSP tests use fake transports and fake clients. They do not require a real JavaScript or TypeScript language server.

## Controls

The controls below mirror the shared keybinding metadata in `keybindings.js`, which is also used by input handling and in-editor help text.

| Key | Action |
| --- | --- |
| Arrow keys | Move cursor |
| Type text | Insert text |
| Enter | Insert newline |
| Tab | Insert two spaces |
| Backspace | Delete before cursor |
| Delete | Delete after cursor |
| Ctrl+S | Save current buffer |
| Ctrl+O | Open a file |
| Ctrl+N | Switch to next buffer |
| Ctrl+P | Switch to previous buffer |
| Ctrl+F | Search |
| Ctrl+G | Next search match |
| Ctrl+Shift+G | Previous search match |
| Ctrl+R | Replace; in replace mode, replace all after entering replacement text |
| Ctrl+T | Tree-sitter query search for supported files |
| Ctrl+Space / F1 | LSP hover for the current supported-language symbol |
| Ctrl+Q | Quit, with confirmation if buffers are modified |
| Ctrl+C | Force quit |
| Esc | Cancel active prompt |

## Search and replace

- `Ctrl+F` opens a search prompt. Typing updates matches immediately, `Ctrl+G` moves to the next match, and `Ctrl+Shift+G` moves to the previous match.
- `Ctrl+R` opens replace mode. Enter the search text, press `Enter`, enter the replacement text, then press `Enter` to replace the current match.
- In replace mode, after entering replacement text, `Ctrl+R` replaces all matches.

## JavaScript and TypeScript AST, syntax highlighting, and tree search

JavaScript-like files (`.js`, `.jsx`, `.mjs`, `.cjs`) and TypeScript files (`.ts`, `.tsx`) are parsed with Tree-sitter.

- Syntax highlighting is rendered from Tree-sitter query captures.
- Parsed syntax trees, highlights, errors, and tree search matches are cached per buffer and refreshed after edits.
- The status row shows `AST ok` for supported files without syntax errors and an error count when Tree-sitter reports syntax errors.
- `Ctrl+T` opens a Tree-sitter query prompt. Enter a friendly preset or a raw Tree-sitter query, press `Enter`, then use `Ctrl+G` / `Ctrl+Shift+G` to move through the captured nodes.

Friendly tree search presets:

- `functions`
- `classes`
- `imports`
- `calls`
- `calls:<name>`
- `variables`
- `syntax-errors`
- `interfaces` for TypeScript and TSX
- `types` for TypeScript and TSX

Example tree query:

```scheme
(function_declaration name: (identifier) @function.name)
```

## JavaScript and TypeScript LSP diagnostics

JavaScript and TypeScript LSP diagnostics use `typescript-language-server --stdio` by default. The server is included as a dev dependency, so `npm install` makes hover and diagnostics available when running through `npm start`.

To override the JavaScript language server command, set:

```bash
TEXT_EDITOR_JS_LSP=custom-language-server TEXT_EDITOR_JS_LSP_ARGS="--stdio" npm start -- src/example.js
```

To disable JavaScript LSP, set:

```bash
TEXT_EDITOR_JS_LSP=0 npm start -- src/example.js
```

To override the TypeScript/TSX language server command, set:

```bash
TEXT_EDITOR_TS_LSP=custom-language-server TEXT_EDITOR_TS_LSP_ARGS="--stdio" npm start -- src/example.ts
```

To disable TypeScript and TSX LSP, set:

```bash
TEXT_EDITOR_TS_LSP=0 npm start -- src/example.ts
```

The editor sends full-document LSP sync events for JavaScript-like files (`.js`, `.jsx`, `.mjs`, `.cjs`) and TypeScript files (`.ts`, `.tsx`):

- opening a supported LSP buffer sends `textDocument/didOpen`
- editing sends full-document `textDocument/didChange` after the buffer version increments
- saving sends `textDocument/didSave`
- save-as opens the new URI and sends `didSave`
- `textDocument/publishDiagnostics` notifications are stored per buffer URI

Diagnostics for the active buffer appear in the LSP sidebar when the terminal is wide enough. In narrow terminals, they fall back to the status row. The sidebar shows server status, hover text, and a short diagnostics preview for the active buffer.

## JavaScript and TypeScript LSP hover

Press `Ctrl+Space` to request `textDocument/hover` for the active supported buffer URI and current cursor position. `F1` also requests hover as a fallback for terminals or OS shortcuts that do not pass `Ctrl+Space` through.

Hover requests first show `LSP hover: loading` in the LSP sidebar, then replace it with hover text or an actionable fallback such as `LSP hover: not enabled`, `LSP hover: server unavailable (...)`, or `LSP hover: unavailable at cursor`. Disabled LSP config, a missing server command, request failures, or empty hover responses do not crash the editor. Moving the cursor or editing clears the hover message. In narrow terminals without room for the sidebar, hover falls back to the status row.

## Save behavior

- `Ctrl+S` saves the current file.
- Unsaved buffers prompt for a save-as path.
- Save-as paths are resolved relative to the current working directory.
- Parent directories are created automatically when saving.

## Known limitations

- Search and replace use case-sensitive plain substring matching.
- Interactive terminal behavior is currently verified manually rather than through automated tests.
