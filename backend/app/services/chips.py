# chips.py
"""Which GWs of the transfer planner's horizon each chip may be played in,
and how a chip choice becomes a planner.ChipPlay. Pure: no I/O."""

from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Set, Tuple, Union

from app.services.planner import ChipPlay

ChipChoice = Union[int, str, None]


def double_gws(fixtures: Iterable[dict]) -> Set[int]:
    """GWs where some club plays twice."""
    club_gws = defaultdict(int)
    for fx in fixtures:
        if fx.get("event"):
            club_gws[(fx["event"], fx["team_h"])] += 1
            club_gws[(fx["event"], fx["team_a"])] += 1
    return {gw for (gw, _), n in club_gws.items() if n > 1}


@dataclass(frozen=True)
class ChipWindows:
    """chips: bootstrap's chips (one of each per half: GW1/2–19, GW20–38);
    played: (name, GW) for each chip already used, including one active for
    the next GW; gws: the horizon; active_gw: a horizon GW already taken (by
    an active chip, or by unlimited transfers); doubles: double GWs."""

    chips: Sequence[dict]
    played: Sequence[Tuple[Optional[str], int]]
    gws: Sequence[int]
    active_gw: Optional[int]
    doubles: Set[int]

    def windows(self, name: str, doubles: bool = False) -> List[List[int]]:
        """The horizon GWs the chip could be played in, per window it's still
        open in. doubles: only a window's double GWs, or its last GW once none
        are left in it."""
        windows = []
        for chip in self.chips:
            if chip.get("name") != name:
                continue
            lo, hi = chip.get("start_event", 0), chip.get("stop_event", 0)
            if any(n == name and lo <= e <= hi for n, e in self.played):
                continue
            allowed = range(lo, hi + 1)
            if doubles:
                left = [g for g in self.doubles if max(lo, self.gws[0]) <= g <= hi]
                allowed = left or [hi]
            window = [g for g in self.gws if g in allowed and g != self.active_gw]
            if window:
                windows.append(window)
        return windows


def chip_play(
    cw: ChipWindows,
    name: str,
    choice: ChipChoice,
    *,
    active_chip: Optional[str],
    wildcard: Optional[int],
    bb_gain: Sequence[float],
) -> Tuple[Optional[ChipPlay], List[int], ChipChoice]:
    """The chip as planned (ChipPlay), its open GWs, and the choice as
    applied. bb_gain: the current squad's projected Bench Boost gain in each
    GW of the horizon."""
    gws = list(cw.gws)
    if active_chip == name:
        return ChipPlay([[gws[0]]], required=True), [], None

    def free(windows: List[List[int]]) -> List[List[int]]:
        # FPL allows one chip per GW: not in a chosen wildcard week
        windows = [[g for g in w if g != wildcard] for w in windows]
        return [w for w in windows if w]

    windows = free(cw.windows(name))
    open_gws = sum(windows, [])
    if choice == "best" and open_gws:
        # A Triple Captain waits for a double GW (else the window's
        # last GW). Picked from any week, the solver spends it as soon
        # as a window opens: within 5 GWs the top captain projects
        # about the same every week. Backtested about even over two
        # seasons (backtest_transfers.py --chips tc: 17 vs 13 chip
        # pts in 2025-26, 31 vs 38 in 2024-25 — one captain haul
        # decides a season), so this keeps the conventional rule and
        # the option of a later double. Held while none is in sight,
        # so "best" is kept but may plan nothing.
        if name == "3xc":
            windows = free(cw.windows(name, doubles=True))
        # A Bench Boost is played this GW once its projected gain tops
        # every later GW of the window in sight, else held: the
        # solver's own pick was the worst rule in 2024-25 (18.7 chip
        # pts/season vs 26.0 for this), the best by a hair in 2025-26
        # (24.6 vs 23.3) — backtest_transfers.py --chips bb, chips_peak
        if name == "bboost":
            windows = [
                [gws[0]]
                for w in windows
                if w[0] == gws[0]
                and bb_gain[0] >= max(bb_gain[gws.index(g)] for g in w)
            ]
            if windows:
                return (
                    ChipPlay(windows, required=True),
                    open_gws,
                    "best",
                )
        return (ChipPlay(windows) if windows else None), open_gws, "best"
    if choice in open_gws:
        return ChipPlay([[choice]], required=True), open_gws, choice
    return None, open_gws, None
