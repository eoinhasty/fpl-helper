// lib/types.ts

export type FixtureLite = {
    opp: string; home: boolean; difficulty: 2 | 3 | 4 | 5; kickoff?: string;
};

export type Player = {
    element: number;
    name: string;
    team: string;
    team_id?: number;
    position: 1 | 2 | 3 | 4;
    price: number;
    status?: string;
    news?: string | null;
    total_points?: number;
    ict_index?: string;
    influence?: string; creativity?: string; threat?: string;
    selected_by_percent?: string;
    start_probability: number;
    gw_points?: number;
    is_captain?: boolean; is_vice_captain?: boolean;
    fixture?: FixtureLite | null;
    slot?: number; multiplier?: number;
    shirt_url?: string;
};

export type SquadResponse = {
    entry_id: number;
    entry_name?: string;
    player_name?: string;
    overall_rank?: number;
    favourite_team?: string;
    used_gw: number;
    current_gw: number;
    used_label: "next" | "current" | "explicit" | "live";
    deadline: string;
    team_value: number;
    team_bank?: number | null;
    players: Player[];
    active_chip?: string | null;
};