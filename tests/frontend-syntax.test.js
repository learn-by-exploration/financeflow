// tests/frontend-syntax.test.js — Validates frontend JS files parse without syntax errors
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PUBLIC = path.join(__dirname, '..', 'public');

function getJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'vendor') {
      files.push(...getJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

describe('Frontend JS syntax validation', () => {
  const jsFiles = getJsFiles(path.join(PUBLIC, 'js'));
  // Also check sw.js in public root
  const swPath = path.join(PUBLIC, 'sw.js');
  if (fs.existsSync(swPath)) jsFiles.push(swPath);

  it('should find frontend JS files to validate', () => {
    assert.ok(jsFiles.length >= 5, `Expected at least 5 JS files, found ${jsFiles.length}`);
  });

  for (const file of jsFiles) {
    const rel = path.relative(PUBLIC, file);
    it(`${rel} has valid syntax`, () => {
      const code = fs.readFileSync(file, 'utf8');
      // Detect module vs script: if file uses import/export, parse as module
      const isModule = /\b(import|export)\b/.test(code);
      try {
        if (isModule) {
          execFileSync(process.execPath, ['--input-type=module', '-c'], {
            input: code,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
          });
        } else {
          execFileSync(process.execPath, ['-c', file], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
          });
        }
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : err.message;
        assert.fail(`Syntax error in ${rel}:\n${stderr}`);
      }
    });
  }
});
