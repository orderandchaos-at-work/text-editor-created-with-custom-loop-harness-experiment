const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadFile, saveFile, resolveSaveAsPath, saveAsFile } = require('./editorCore');

describe('editor core file helpers', () => {
  test('loads an existing file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const filePath = path.join(tmpDir, 'sample.txt');
    const content = 'hello\nworld';

    fs.writeFileSync(filePath, content, 'utf8');

    expect(loadFile(filePath)).toEqual(['hello', 'world']);
  });

  test('saves into nested directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const filePath = path.join(tmpDir, 'nested', 'save.txt');

    expect(saveFile(filePath, ['saved'])).toBe(true);

    expect(fs.readFileSync(filePath, 'utf8')).toBe('saved');
  });

  test('save-as resolves relative paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));

    expect(resolveSaveAsPath(path.join('nested', 'save.txt'), tmpDir)).toBe(path.join(tmpDir, 'nested', 'save.txt'));
  });

  test('save-as saves to resolved relative paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-'));
    const resolved = saveAsFile(path.join('nested', 'save.txt'), ['hello', 'world'], tmpDir);

    expect(resolved).toBe(path.join(tmpDir, 'nested', 'save.txt'));
    expect(fs.readFileSync(resolved, 'utf8')).toBe('hello\nworld');
  });

  test('save-as returns false for blank paths', () => {
    expect(resolveSaveAsPath('')).toBe(false);
    expect(saveAsFile('', ['content'])).toBe(false);
  });
});
