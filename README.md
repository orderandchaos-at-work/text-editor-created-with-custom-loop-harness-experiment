# text-editor

A small terminal text editor built with Node.js. It opens in an alternate terminal screen, supports multiple buffers, and provides basic editing, search, replace, open, save, save-as, and JavaScript Tree-sitter workflows.

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

Automated tests cover file helper behavior, pure editor state helpers, and the Tree-sitter syntax service, including AST parsing, syntax highlighting, tree search, and syntax cache behavior. Interactive terminal behavior is covered by the manual QA checklist in `docs/manual-qa.md`.

## Controls

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
| Ctrl+Q | Quit, with confirmation if buffers are modified |
| Ctrl+C | Force quit |
| Esc | Cancel active prompt |

## Search and replace

- `Ctrl+F` opens a search prompt. Typing updates matches immediately, `Ctrl+G` moves to the next match, and `Ctrl+Shift+G` moves to the previous match.
- `Ctrl+R` opens replace mode. Enter the search text, press `Enter`, enter the replacement text, then press `Enter` to replace the current match.
- In replace mode, after entering replacement text, `Ctrl+R` replaces all matches.

## JavaScript AST, syntax highlighting, and tree search

JavaScript-like files (`.js`, `.jsx`, `.mjs`, `.cjs`) are parsed with Tree-sitter.

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

Example tree query:

```scheme
(function_declaration name: (identifier) @function.name)
```

## Save behavior

- `Ctrl+S` saves the current file.
- Unsaved buffers prompt for a save-as path.
- Save-as paths are resolved relative to the current working directory.
- Parent directories are created automatically when saving.

## Known limitations

- Long lines are truncated visually; horizontal scrolling is not implemented yet.
- Search and replace use case-sensitive plain substring matching.
- Unicode display width may be inaccurate for emoji, CJK characters, and combining characters.
- Interactive terminal behavior is currently verified manually rather than through automated tests.
