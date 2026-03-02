#!/usr/bin/env node
/**
 * maximus-cli — Eburon Model CLI
 *
 * Detected host CLIs:
 *   npm   @ 11.9.0   ← active (package-lock.json detected)
 *   node  @ 25.6.1
 *
 * Usage:
 *   maximus-cli <command> [...args]
 *
 * Delegates to the detected package manager (npm).
 */

const { spawnSync } = require('child_process');
const args = process.argv.slice(2);

const CLI_MAP = {
  // alias → { bin, version }
  'npm@11.9.0': { bin: 'npm', version: '11.9.0' },
  'node@25.6.1': { bin: 'node', version: '25.6.1' },
};

const DEFAULT_CLI = 'npm';

if (args[0] === '--version' || args[0] === '-v') {
  console.log('maximus-cli (Eburon Model)');
  console.log('Detected host CLIs:');
  Object.entries(CLI_MAP).forEach(([alias, { bin, version }]) => {
    console.log(`  ${alias.padEnd(20)} → ${bin} v${version}`);
  });
  process.exit(0);
}

if (args[0] === '--help' || args[0] === '-h' || !args.length) {
  console.log('maximus-cli (Eburon Model)');
  console.log('');
  console.log('Usage:  maximus-cli <npm-command> [...args]');
  console.log('');
  console.log('Examples:');
  console.log('  maximus-cli install');
  console.log('  maximus-cli run dev');
  console.log('  maximus-cli run build');
  console.log('  maximus-cli --version');
  process.exit(0);
}

const result = spawnSync(DEFAULT_CLI, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
