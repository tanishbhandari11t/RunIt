import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/**
 * Detects a Go module from go.mod and finds its `package main`: either in the
 * module root (`go run .`) or under the conventional cmd/<name>/ layout.
 * Library modules with no main package are skipped.
 */
export function detectGo(dir: string, label: string): ServicePlan[] {
  const goMod = readFile(path.join(dir, 'go.mod'));
  if (!goMod) {
    return [];
  }

  let target: string | undefined;
  if (hasMainPackage(dir)) {
    target = '.';
  } else {
    const moduleName = goMod.match(/^module\s+(\S+)/m)?.[1].split('/').pop();
    const commands = listDirs(path.join(dir, 'cmd')).filter((name) => hasMainPackage(path.join(dir, 'cmd', name)));
    const chosen = commands.find((name) => name === moduleName) ?? commands[0];
    if (chosen) {
      target = `./cmd/${chosen}`;
    }
  }

  if (!target) {
    return [];
  }

  return [
    {
      name: `Backend (Go) — ${label}`,
      language: 'go',
      role: 'backend',
      cwd: dir,
      installCommands: ['go mod download'],
      launchCommand: `go run ${target}`,
      order: 2,
      readyPatterns: ['listening', 'server started', ':\\d{4}'],
      requiredTools: [TOOLS.go],
    },
  ];
}

function hasMainPackage(dir: string): boolean {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'))
      .some((f) => /^package\s+main\b/m.test(readFile(path.join(dir, f))));
  } catch {
    return false;
  }
}

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function readFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
