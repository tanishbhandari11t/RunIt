import { ServicePlan } from '../types';
import { detectDocker } from './docker';
import { detectGo } from './go';
import { detectJava } from './java';
import { detectNode } from './node';
import { detectPython } from './python';
import { detectRust } from './rust';

const DETECTORS = [detectDocker, detectNode, detectPython, detectJava, detectGo, detectRust];

/** Runs every language detector against one directory. */
export function detectServices(dir: string, label: string): ServicePlan[] {
  return DETECTORS.flatMap((detect) => detect(dir, label));
}
