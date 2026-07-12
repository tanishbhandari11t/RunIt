import * as fs from 'fs';
import * as path from 'path';
import { detectServices } from '../detectors/detector';
import { DetectedProject } from '../types';

/** Directories that are never scanned. */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'vendor',
]);

/** Marker files worth reporting in the analysis output. */
const KEY_FILES = [
  'package.json', 'package-lock.json', 'vite.config.js', 'vite.config.ts',
  'next.config.js', 'next.config.ts', 'tsconfig.json',
  'requirements.txt', 'pyproject.toml', 'manage.py', 'main.py', 'app.py',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'go.mod', 'Cargo.toml',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'compose.yml',
  'README.md',
];

/**
 * Scans the workspace root and its immediate subdirectories so that
 * monorepos like frontend/ + backend/ produce one service each.
 */
export function scanProject(root: string): DetectedProject {
  const services = [...detectServices(root, path.basename(root))];
  const keyFiles = listKeyFiles(root, '');

  for (const entry of safeReadDir(root)) {
    if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
      const sub = path.join(root, entry.name);
      services.push(...detectServices(sub, entry.name));
      keyFiles.push(...listKeyFiles(sub, entry.name));
    }
  }

  const languages = [...new Set(services.map((s) => s.language))];
  const frameworks = [...new Set(services.flatMap((s) => (s.framework ? [s.framework] : [])))];

  return { root, languages, frameworks, services, keyFiles };
}

/** Returns the recognized marker files present in one directory. */
function listKeyFiles(dir: string, prefix: string): string[] {
  const found: string[] = [];
  for (const file of KEY_FILES) {
    if (fs.existsSync(path.join(dir, file))) {
      found.push(prefix ? `${prefix}/${file}` : file);
    }
  }
  return found;
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
