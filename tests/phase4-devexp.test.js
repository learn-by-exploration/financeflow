const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('Phase 4 — Developer Experience', () => {
  describe('4.1 — GitHub Actions CI + c8 Coverage', () => {
    it('ci.yml exists and is valid YAML', () => {
      const ciPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');
      assert.ok(fs.existsSync(ciPath), 'ci.yml should exist');
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.ok(content.length > 0, 'ci.yml should be non-empty');
      // Basic YAML structure checks
      assert.ok(content.includes('name:'), 'ci.yml must have a name field');
      assert.ok(content.includes('jobs:'), 'ci.yml must have a jobs section');
    });

    it('ci.yml uses Node.js 22', () => {
      const content = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'ci.yml'),
        'utf8'
      );
      assert.ok(content.includes('22'), 'ci.yml should reference Node.js 22');
    });

    it('ci.yml runs npm test', () => {
      const content = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'ci.yml'),
        'utf8'
      );
      assert.ok(content.includes('npm test'), 'ci.yml should run npm test');
    });

    it('ci.yml triggers on push and pull_request', () => {
      const content = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', 'ci.yml'),
        'utf8'
      );
      assert.ok(content.includes('push'), 'ci.yml should trigger on push');
      assert.ok(
        content.includes('pull_request'),
        'ci.yml should trigger on pull_request'
      );
    });

    it('package.json devDependencies includes c8', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(
        pkg.devDependencies && pkg.devDependencies.c8,
        'c8 should be in devDependencies'
      );
    });

    it('package.json has test:auth script', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(pkg.scripts['test:auth'], 'test:auth script should exist');
      assert.ok(
        pkg.scripts['test:auth'].includes('auth'),
        'test:auth should reference auth test files'
      );
    });

    it('package.json has test:security script', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(
        pkg.scripts['test:security'],
        'test:security script should exist'
      );
      assert.ok(
        pkg.scripts['test:security'].includes('security'),
        'test:security should reference security test files'
      );
    });

    it('package.json has test:perf script', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(pkg.scripts['test:perf'], 'test:perf script should exist');
      assert.ok(
        pkg.scripts['test:perf'].includes('performance'),
        'test:perf should reference performance test files'
      );
    });

    it('package.json has test:fast script without c8', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(pkg.scripts['test:fast'], 'test:fast script should exist');
      assert.ok(
        !pkg.scripts['test:fast'].includes('c8'),
        'test:fast should NOT use c8'
      );
      assert.ok(
        pkg.scripts['test:fast'].includes('--test'),
        'test:fast should use --test flag'
      );
    });

    it('package.json test script uses c8 for coverage', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
      );
      assert.ok(
        pkg.scripts.test.includes('c8'),
        'test script should use c8 for coverage'
      );
      assert.ok(
        pkg.scripts.test.includes('--test'),
        'test script should still use --test flag'
      );
    });
  });

  describe('4.2 — CONTRIBUTING.md + Architecture Docs', () => {
    it('CONTRIBUTING.md exists and is non-empty', () => {
      const contribPath = path.join(ROOT, 'CONTRIBUTING.md');
      assert.ok(fs.existsSync(contribPath), 'CONTRIBUTING.md should exist');
      const content = fs.readFileSync(contribPath, 'utf8');
      assert.ok(content.length > 100, 'CONTRIBUTING.md should have content');
      assert.ok(
        content.includes('Contributing'),
        'CONTRIBUTING.md should have a contributing header'
      );
    });

    it('docs/architecture.md exists and contains Mermaid diagram', () => {
      const archPath = path.join(ROOT, 'docs', 'architecture.md');
      assert.ok(fs.existsSync(archPath), 'docs/architecture.md should exist');
      const content = fs.readFileSync(archPath, 'utf8');
      assert.ok(
        content.includes('```mermaid'),
        'architecture.md should contain Mermaid diagram syntax'
      );
    });

    it('.vscode/launch.json exists', () => {
      const launchPath = path.join(ROOT, '.vscode', 'launch.json');
      assert.ok(
        fs.existsSync(launchPath),
        '.vscode/launch.json should exist'
      );
      const content = fs.readFileSync(launchPath, 'utf8');
      const config = JSON.parse(content);
      assert.ok(
        config.configurations && config.configurations.length >= 3,
        'launch.json should have at least 3 configurations'
      );
    });
  });
});
