const fs = require('fs');
const path = require('path');

function loadFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  return lines.length === 0 ? [''] : lines;
}

function loadExistingFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [''];
  }
  return loadFile(filePath);
}

function saveFile(filePath, lines) {
  if (!filePath) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return true;
}

function resolveSaveAsPath(targetPath, cwd = process.cwd()) {
  if (!targetPath) {
    return false;
  }
  return path.resolve(cwd, targetPath);
}

function saveAsFile(targetPath, lines, cwd = process.cwd()) {
  const resolved = resolveSaveAsPath(targetPath, cwd);
  return resolved && saveFile(resolved, lines) ? resolved : false;
}

module.exports = {
  loadFile,
  loadExistingFile,
  saveFile,
  resolveSaveAsPath,
  saveAsFile,
};
