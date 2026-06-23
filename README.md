# text-editor

A small terminal text editor built with Node.js. It opens in an alternate terminal screen, supports multiple buffers, and provides basic editing, search, replace, open, save, and save-as workflows.

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
| Ctrl+R | Replace |
| Ctrl+Q | Quit, with confirmation if buffers are modified |
| Ctrl+C | Force quit |
| Esc | Cancel active prompt |

## Save behavior

- `Ctrl+S` saves the current file.
- Unsaved buffers prompt for a save-as path.
- Save-as paths are resolved relative to the current working directory.
- Parent directories are created automatically when saving.

## Known limitations

- Long lines are truncated visually; horizontal scrolling is not implemented yet.
- Search and replace use plain substring matching.
- Unicode display width may be inaccurate for emoji, CJK characters, and combining characters.
- Most interactive terminal behavior is currently verified manually rather than through automated tests.
