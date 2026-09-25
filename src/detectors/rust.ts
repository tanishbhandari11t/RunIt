import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/** Detects a runnable Rust crate or workspace from Cargo.toml; library-only crates are skipped. */
export function detectRust(dir: string, label: string): ServicePlan[] {
  let cargoToml: string;
  try {
    cargoToml = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
  } catch {
    return [];
  }

  const isRunnable =
    /^\[workspace\]/m.test(cargoToml) ||
    /^\[\[bin\]\]/m.test(cargoToml) ||
    fs.existsSync(path.join(dir, 'src', 'main.rs')) ||
    fs.existsSync(path.join(dir, 'src', 'bin'));
  if (!isRunnable) {
    return [];
  }

  return [
    {
      name: `App (Rust) — ${label}`,
      language: 'rust',
      role: 'app',
      cwd: dir,
      installCommands: ['cargo build'],
      launchCommand: 'cargo run',
      order: 2,
      readyPatterns: ['Running `', 'listening', 'localhost:\\d+'],
      requiredTools: [TOOLS.rust],
    },
  ];
}
