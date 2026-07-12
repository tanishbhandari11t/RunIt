import * as fs from 'fs';
import * as path from 'path';
import { ServicePlan } from '../types';
import { TOOLS } from './tools';

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'compose.yml'];

/**
 * Detects Docker Compose. Compose usually hosts infrastructure
 * (databases, caches), so it gets order 0 and starts first.
 */
export function detectDocker(dir: string, label: string): ServicePlan[] {
  const composeFile = COMPOSE_FILES.find((f) => fs.existsSync(path.join(dir, f)));
  if (!composeFile) {
    return [];
  }
  return [
    {
      name: `Docker Compose (${label})`,
      language: 'docker',
      role: 'database',
      cwd: dir,
      installCommands: [],
      launchCommand: 'docker compose up',
      order: 0,
      readyPatterns: ['Started', 'ready to accept connections', 'Attaching to'],
      requiredTool: TOOLS.docker,
    },
  ];
}
