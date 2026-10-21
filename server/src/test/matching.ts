import { calculateResults as calculate } from '../services/matching';
import { inTestRuntime } from './runtime';
export function calculateResults(id: string, voters = false) { return inTestRuntime(() => calculate(id, voters)); }
