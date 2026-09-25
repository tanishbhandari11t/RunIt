import { exec } from 'child_process';
import { ServicePlan, ToolRequirement } from './types';

export interface ToolCheckResult {
  tool: ToolRequirement;
  installed: boolean;
  version?: string;
}

/** Probes each unique required tool on PATH by running its version command. */
export async function checkEnvironment(plan: ServicePlan[]): Promise<ToolCheckResult[]> {
  const unique = new Map<string, ToolRequirement>();
  for (const service of plan) {
    for (const tool of service.requiredTools) {
      unique.set(tool.command, tool);
    }
  }

  const checks = [...unique.values()].map(
    (tool) =>
      new Promise<ToolCheckResult>((resolve) => {
        exec(
          [tool.command, ...tool.versionArgs].join(' '),
          { timeout: 15000 },
          (error, stdout, stderr) => {
            const output = (stdout || stderr || '').trim().split('\n')[0];
            resolve({ tool, installed: !error, version: error ? undefined : output });
          },
        );
      }),
  );

  return Promise.all(checks);
}
