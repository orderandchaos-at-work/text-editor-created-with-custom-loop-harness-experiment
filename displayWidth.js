function charWidth(char) {
  if (!char) return 0;
  if (char === '\t') return 2;
  const code = char.codePointAt(0);
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if ((code >= 0x0300 && code <= 0x036f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff) || (code >= 0x20d0 && code <= 0x20ff) || (code >= 0xfe20 && code <= 0xfe2f)) return 0;
  if ((code >= 0x1100 && code <= 0x115f) || code === 0x2329 || code === 0x232a || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1f300 && code <= 0x1faff)) return 2;
  return 1;
}

function textWidth(text) {
  let width = 0;
  for (const char of text || '') width += charWidth(char);
  return width;
}

function displayText(text) {
  return (text || '').replace(/\t/g, '  ');
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function renderedWidth(text) {
  return textWidth(stripAnsi(text));
}

function padRendered(text, width) {
  const plainWidth = renderedWidth(text);
  if (plainWidth >= width) return text;
  return text + ' '.repeat(width - plainWidth);
}

function truncate(text, width) {
  if (textWidth(text) <= width) return text;
  let output = '';
  let used = 0;
  const marker = width > 0 ? '…' : '';
  const markerWidth = textWidth(marker);
  for (const char of text) {
    const charColumns = charWidth(char);
    if (used + charColumns + markerWidth > width) break;
    output += char;
    used += charColumns;
  }
  return output + marker;
}

function columnToIndex(text, column) {
  let width = 0;
  for (let index = 0; index < text.length;) {
    const char = Array.from(text.slice(index))[0];
    const nextWidth = width + charWidth(char);
    if (nextWidth > column) return index;
    width = nextWidth;
    index += char.length;
  }
  return text.length;
}

function sliceByColumns(text, startColumn, width) {
  const start = columnToIndex(text, startColumn);
  let end = start;
  let used = 0;
  while (end < text.length) {
    const char = Array.from(text.slice(end))[0];
    const charColumns = charWidth(char);
    if (used + charColumns > width) break;
    used += charColumns;
    end += char.length;
  }
  return { text: text.slice(start, end), start, end, width: used };
}

module.exports = {
  charWidth,
  displayText,
  textWidth,
  stripAnsi,
  renderedWidth,
  padRendered,
  truncate,
  columnToIndex,
  sliceByColumns,
};
