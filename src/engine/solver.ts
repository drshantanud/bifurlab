/**
 * Integration point for a future, validated mechanical (finite-element) backend.
 * The illustrative engine does not implement this interface; the UI shows
 * "Mechanical simulation not available in this build" while no solver is registered.
 */
import type { Anatomy } from './anatomy';
import type { Scenario } from './scenario';
import type { DeviceRecord } from '../data/deviceSchema';

export interface SolverValidation {
  devicesValidated: string[];
  conditions: string;
  errorMetrics: { name: string; value: number; unit: string }[];
  referenceData: string[];
}

export interface MechanicalSolverResult {
  solverName: string;
  solverVersion: string;
  materialModel: string;
  boundaryConditions: string;
  contactAssumptions: string;
  meshResolution: string;
  converged: boolean;
  convergenceInfo: string;
  /** Deformed strut node positions per stent, mm */
  nodePositions: Float32Array[];
  stressField?: Float32Array[];
  strainField?: Float32Array[];
  validation: SolverValidation | null;
}

export interface MechanicalSolver {
  id: string;
  /** Returns false when device data needed for this scenario are missing. */
  supports(scenario: Scenario, devices: DeviceRecord[]): boolean;
  run(anatomy: Anatomy, scenario: Scenario, devices: DeviceRecord[], stageIndex: number): Promise<MechanicalSolverResult>;
}

const registered: MechanicalSolver[] = [];
export const registerSolver = (s: MechanicalSolver) => registered.push(s);
export const availableSolvers = () => [...registered];
