// lib/constants.ts
export const VB = { W: 1417, H: 788 };
export const CHIP = { WIDTH: 128, SHIRT_BOX: 64, SHIRT_IMG: 46, BANNER_H: 32, NAME_FS: 13, TEAM_FS: 11 };
export const PITCH = {
  X_MIN: 120,
  X_MAX: 1297,
  ROW_Y: { GK: 100, DEF: 265, MID: 460, FWD: 655 } as const,
  /** Y range for the three outfield rows (DEF/MID/FWD), distributed dynamically per formation */
  FIELD_Y: { TOP: 265, BOT: 655 } as const,
  Y_GK: 100,
  ROW_CFG: {
    GK:  { widthFactor: 0.76, pinch: 1.45 },
    // pinch: governs inner player spacing for n>3. Lower = more even spread.
    // DEF 1.3: good even spacing for 4 or 5 defenders.
    // MID 1.0: perfect equal gaps for 5 midfielders (most common janky case).
    // FWD 2.0: only affects n≥4 which never occurs in FPL — safe to leave high.
    DEF: { widthFactor: 0.84, pinch: 1.30 },
    MID: { widthFactor: 0.88, pinch: 1.00 },
    FWD: { widthFactor: 0.50, pinch: 2.00 },
  } as const,
};