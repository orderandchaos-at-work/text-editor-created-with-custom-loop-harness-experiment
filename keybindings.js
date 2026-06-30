const keybindings = [
  { id: 'move', keys: ['Arrow keys'], action: 'Move cursor', helpKey: 'Arrows', helpAction: 'Move' },
  { id: 'type', keys: ['Type text'], action: 'Insert text' },
  { id: 'newline', keys: ['Enter'], action: 'Insert newline' },
  { id: 'tab', keys: ['Tab'], action: 'Insert two spaces' },
  { id: 'backspace', keys: ['Backspace'], action: 'Delete before cursor' },
  { id: 'delete', keys: ['Delete'], action: 'Delete after cursor' },
  { id: 'save', keys: ['Ctrl+S'], action: 'Save current buffer', helpAction: 'Save', match: key => key.ctrl && key.name === 's' },
  { id: 'open', keys: ['Ctrl+O'], action: 'Open a file', helpAction: 'Open', match: key => key.ctrl && key.name === 'o' },
  { id: 'nextBuffer', keys: ['Ctrl+N'], action: 'Switch to next buffer', match: key => key.ctrl && key.name === 'n' },
  { id: 'previousBuffer', keys: ['Ctrl+P'], action: 'Switch to previous buffer', match: key => key.ctrl && key.name === 'p' },
  { id: 'search', keys: ['Ctrl+F'], action: 'Search', helpAction: 'Search', match: key => key.ctrl && key.name === 'f' },
  { id: 'nextMatch', keys: ['Ctrl+G'], action: 'Next search match', helpAction: 'next', match: key => key.ctrl && key.name === 'g' && !key.shift },
  { id: 'previousMatch', keys: ['Ctrl+Shift+G'], action: 'Previous search match', helpAction: 'prev', match: key => key.ctrl && key.name === 'g' && key.shift },
  { id: 'replace', keys: ['Ctrl+R'], action: 'Replace; in replace mode, replace all after entering replacement text', helpAction: 'Replace', match: key => key.ctrl && key.name === 'r' },
  { id: 'tree', keys: ['Ctrl+T'], action: 'Tree-sitter query search for supported files', helpAction: 'Tree', match: key => key.ctrl && key.name === 't' },
  { id: 'hover', keys: ['Ctrl+Space / F1'], action: 'LSP hover for the current supported-language symbol', helpAction: 'Hover', match: key => key.name === 'f1' || (key.ctrl && key.name === 'space') || key.sequence === '\u0000' },
  { id: 'quit', keys: ['Ctrl+Q'], action: 'Quit, with confirmation if buffers are modified', helpAction: 'Quit', match: key => key.ctrl && key.name === 'q' },
  { id: 'forceQuit', keys: ['Ctrl+C'], action: 'Force quit', match: key => key.ctrl && key.name === 'c' },
  { id: 'cancel', keys: ['Esc'], action: 'Cancel active prompt', helpAction: 'cancel' },
];

function keybinding(id) {
  return keybindings.find(binding => binding.id === id);
}

function keyLabel(id) {
  const binding = keybinding(id);
  return binding ? binding.keys[0] : '';
}

function helpLabel(id) {
  const binding = keybinding(id);
  return binding ? binding.helpKey || binding.keys[0] : '';
}

function helpAction(id) {
  const binding = keybinding(id);
  return binding ? binding.helpAction || binding.action : '';
}

function matches(id, key) {
  const binding = keybinding(id);
  return Boolean(binding && binding.match && binding.match(key));
}

function readmeRows() {
  return keybindings.map(binding => [binding.keys.join(' / '), binding.action]);
}

module.exports = {
  keybindings,
  keybinding,
  keyLabel,
  helpLabel,
  helpAction,
  matches,
  readmeRows,
};
