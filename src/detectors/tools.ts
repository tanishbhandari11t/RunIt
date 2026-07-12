import { Language, ToolRequirement } from '../types';

/** The machine-level tool each language needs before anything can run. */
export const TOOLS: Record<Language, ToolRequirement> = {
  javascript: {
    command: 'node',
    versionArgs: ['--version'],
    displayName: 'Node.js',
    installHint: 'Install Node.js 20+ from https://nodejs.org',
  },
  python: {
    command: process.platform === 'win32' ? 'python' : 'python3',
    versionArgs: ['--version'],
    displayName: 'Python',
    installHint: 'Install Python 3.10+ from https://python.org',
  },
  java: {
    command: 'java',
    versionArgs: ['--version'],
    displayName: 'Java JDK',
    installHint: 'Install JDK 21 from https://adoptium.net',
  },
  go: {
    command: 'go',
    versionArgs: ['version'],
    displayName: 'Go',
    installHint: 'Install Go from https://go.dev/dl',
  },
  rust: {
    command: 'cargo',
    versionArgs: ['--version'],
    displayName: 'Rust (cargo)',
    installHint: 'Install Rust via https://rustup.rs',
  },
  docker: {
    command: 'docker',
    versionArgs: ['--version'],
    displayName: 'Docker',
    installHint: 'Install Docker Desktop from https://docker.com',
  },
};
