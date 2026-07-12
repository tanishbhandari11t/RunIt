import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/** Detects a Rust project from Cargo.toml. */
export function detectRust(dir: string, label: string): ServicePlan[] {
  if (!fs.existsSync(path.join(dir, 'Cargo.toml'))) {
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
      readyPatterns: ['Running', 'listening'],
      requiredTool: TOOLS.rust,
    },
  ];
}
