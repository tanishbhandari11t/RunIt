import * as fs from 'fs';
import * as path from 'path';
import { Language, ServicePlan } from '../types';
import { runEntry } from './node';
import { TOOLS } from './tools';

interface ScriptRunner {
  language: Language;
  matches: (file: string) => boolean;
  /** Content check that the file is actually an executable entry point. */
  isEntry?: (source: string) => boolean;
  command: (file: string) => string;
}

const RUNNERS: ScriptRunner[] = [
  {
    language: 'python',
    matches: (f) => f.endsWith('.py') && !['setup.py', 'conftest.py'].includes(f),
    command: (f) => `${TOOLS.python.command} ${f}`,
  },
  {
    language: 'javascript',
    matches: (f) => /\.(c|m)?(j|t)s$/.test(f) && !/(\.config|rc)\.(c|m)?(j|t)s$/.test(f) && !f.endsWith('.d.ts'),
    command: runEntry,
  },
  {
    language: 'go',
    matches: (f) => f.endsWith('.go') && !f.endsWith('_test.go'),
    isEntry: (s) => /^package\s+main\b/m.test(s),
    command: (f) => `go run ${f}`,
  },
  {
    // JDK 11+ compiles and runs a single source file directly.
    language: 'java',
    matches: (f) => f.endsWith('.java'),
    isEntry: (s) => /static\s+void\s+main\s*\(/.test(s),
    command: (f) => `java ${f}`,
  },
];

/**
 * Last-resort detection for a folder that is just one script with no project
 * files (e.g. hello.py). Only used for the workspace root when nothing else
 * matched, so stray assets like static/app.js are never launched.
 */
export function detectSingleScript(dir: string, label: string): ServicePlan[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }

  for (const runner of RUNNERS) {
    const matches = files.filter(runner.matches);
    if (matches.length === 1 && (!runner.isEntry || runner.isEntry(readFile(path.join(dir, matches[0]))))) {
      return [
        {
          name: `Script (${matches[0]}) — ${label}`,
          language: runner.language,
          role: 'app',
          cwd: dir,
          installCommands: [],
          launchCommand: runner.command(matches[0]),
          order: 2,
          readyPatterns: ['localhost:\\d+', 'listening', 'Running on http'],
          requiredTools: [TOOLS[runner.language]],
        },
      ];
    }
  }
  return [];
}

function readFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
