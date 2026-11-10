// hooks/usePlayerDetail.tsx
import * as React from "react";
import PlayerDetailModal from "../components/squad/PlayerDetailModal";
import PendingPlayerModal from "../components/squad/PendingPlayerModal";
import { useFetch } from "./useFetch";
import { poolPlayerToPlayer } from "../lib/plannerAdapter";
import type { Player, PlayersResponse, PoolPlayer } from "../lib/types";

/** Opens the player detail modal by FPL element id. The rule: every player
 * row in every card opens it (via PlayerOpen). Null outside a page that
 * hosts the modal, where rows render as plain text. */
export const PlayerDetailContext = React.createContext<((id: number) => void) | null>(null);

export const usePlayerDetail = () => React.useContext(PlayerDetailContext);

/** Owns the modal for a page. A squad player opens with the squad's own data
 * (start probability, GW points); anyone else — a buy target, a Hot News
 * player — comes from the player pool, fetched on first need unless the page
 * already has it. Pool players have no start-probability estimate, so the
 * modal hides it for them, as the planner always has.
 *
 * The modal names the GW each number belongs to, so the host passes them:
 * the squad's points GW (`used_gw`) and fixture GW (`fixture_gw`), and the
 * pool's `gw` (which its fixtures and projections start from). */
export function usePlayerDetailHost({
  squad,
  squadGws,
  pool,
  poolGw,
  season,
}: {
  squad?: Player[] | null;
  squadGws?: { points?: number; fixtures?: number };
  pool?: PoolPlayer[] | null;
  poolGw?: number | null;
  season?: string | null;
}) {
  const [selected, setSelected] = React.useState<number | null>(null);
  const close = React.useCallback(() => setSelected(null), []);

  const fromSquad = selected == null ? undefined : squad?.find((p) => p.element === selected);
  // Once fetched, keep the pool for later opens instead of refetching
  const [wantPool, setWantPool] = React.useState(false);
  if (selected != null && !fromSquad && !pool && !wantPool) setWantPool(true);
  const fetched = useFetch<PlayersResponse>(wantPool && !pool ? "/api/players" : null);
  const players = pool ?? fetched.data?.players;
  const fromPool = fromSquad || selected == null ? undefined : players?.find((p) => p.id === selected);

  let modal: React.ReactNode = null;
  if (selected != null) {
    if (fromSquad) {
      modal = (
        <PlayerDetailModal
          key={selected}
          open
          onClose={close}
          player={fromSquad}
          pointsGw={squadGws?.points}
          fixtureGw={squadGws?.fixtures}
          season={season}
        />
      );
    } else if (fromPool) {
      const gw = pool ? poolGw : fetched.data?.gw;
      modal = (
        <PlayerDetailModal
          key={selected}
          open
          onClose={close}
          player={poolPlayerToPlayer(fromPool, 1, gw)}
          fixtureGw={gw ?? undefined}
          hideStartProbability
          season={season ?? fetched.data?.season}
        />
      );
    } else {
      const status = players
        ? "This player isn't in the current FPL player list."
        : fetched.error
          ? "Couldn't load player details."
          : "Loading player…";
      modal = <PendingPlayerModal key={selected} onClose={close} status={status} />;
    }
  }

  return { open: setSelected as (id: number) => void, modal };
}
