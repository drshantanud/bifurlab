export type ViewPreset = 'overview' | 'proximal' | 'distal' | 'sb' | 'carina' | 'ostium';

export interface DisplaySettings {
  showWall: boolean;
  showLumen: boolean;
  showPlaque: boolean;
  showStent: boolean;
  showBalloons: boolean;
  showWires: boolean;
  showMeasurements: boolean;
  /** Visual-only strut magnification for visibility at overview zoom */
  strutScale: number;
  colors: { wall: string; lumen: string; plaque: string; stent: string; stent2: string; balloon: string; measure: string; background: string };
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  showWall: true,
  showLumen: true,
  showPlaque: true,
  showStent: true,
  showBalloons: true,
  showWires: true,
  showMeasurements: true,
  strutScale: 2,
  colors: {
    wall: '#e79ab0',
    lumen: '#2a3446',
    plaque: '#c9b25a',
    stent: '#b9c6d4',
    stent2: '#7fa9e0',
    balloon: '#5fd0d6',
    measure: '#7fe3e3',
    background: '#0d1828',
  },
};
