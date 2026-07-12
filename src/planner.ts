import { DetectedProject, ServicePlan } from './types';

/**
 * Orders services so dependencies start first:
 * database/infra (0) -> backend (2) -> worker -> frontend (3).
 * Deduplicates services that resolve to the same cwd + command.
 */
export function buildLaunchPlan(project: DetectedProject): ServicePlan[] {
  const seen = new Set<string>();
  const plan: ServicePlan[] = [];

  const sorted = [...project.services].sort((a, b) => a.order - b.order);
  for (const service of sorted) {
    const key = `${service.cwd}::${service.launchCommand}`;
    if (!seen.has(key)) {
      seen.add(key);
      plan.push(service);
    }
  }
  return plan;
}

export function describePlan(plan: ServicePlan[]): string {
  const lines: string[] = ['# RunIt Launch Plan', ''];
  plan.forEach((service, i) => {
    lines.push(`## ${i + 1}. ${service.name}`);
    lines.push(`- Directory: \`${service.cwd}\``);
    if (service.installCommands.length > 0) {
      lines.push(`- Install: \`${service.installCommands.join(' && ')}\``);
    }
    lines.push(`- Launch: \`${service.launchCommand}\``);
    lines.push('');
  });
  return lines.join('\n');
}
