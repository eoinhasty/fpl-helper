// Test-only factories for lib/ tests
import type { Player } from "../lib/types";

/** A player in squad slot `slot` (its element id too); 1–11 start. */
export function player(slot: number, position: Player["position"], extra: Partial<Player> = {}): Player {
  return {
    element: slot,
    name: `P${slot}`,
    team: "ARS",
    position,
    price: 5,
    start_probability: 0.9,
    slot,
    multiplier: slot <= 11 ? 1 : 0,
    ...extra,
  };
}

/** 15 players by slot from their positions (element id = slot). */
export function squad(positions: number[], extra: (slot: number) => Partial<Player> = () => ({})): Player[] {
  return positions.map((pos, i) => player(i + 1, pos as Player["position"], extra(i + 1)));
}

export const POSITIONS_442 = [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 1, 2, 3, 4];
