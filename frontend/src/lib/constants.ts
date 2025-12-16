// lib/constants.ts
export const VB = { W: 1417, H: 788 };
export const CHIP = { WIDTH: 128, SHIRT_BOX: 64, SHIRT_IMG: 46, BANNER_H: 32, NAME_FS: 13, TEAM_FS: 11 };
export const PITCH = {
  X_MIN: 120,
  X_MAX: 1297,
  ROW_Y: { GK: 100, DEF: 230, MID: 380, FWD: 580 } as const,
  ROW_CFG: {
    GK:  { widthFactor: 0.76, pinch: 1.45 },
    DEF: { widthFactor: 0.84, pinch: 1.65 },
    MID: { widthFactor: 0.88, pinch: 1.70 },
    FWD: { widthFactor: 0.50, pinch: 2.00 },
  } as const,
};