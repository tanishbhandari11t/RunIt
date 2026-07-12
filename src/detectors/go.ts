import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

/** Detects a Go project from go.mod. */
export function detectGo(dir: string, label: string): ServicePlan[] {
  if (!fs.existsSync(path.join(dir, 'go.mod'))) {
    return [];
  }
  return [
    {
      name: `Backend (Go) — ${label}`,
      language: 'go',
      role: 'backend',
      cwd: dir,
      installCommands: ['go mod download'],
      launchCommand: 'go run .',
      order: 2,
      readyPatterns: ['listening', 'server started', ':\\d{4}'],
      requiredTool: TOOLS.go,
    },
  ];
}
