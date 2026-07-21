// lib/types.ts

export type PlayerRank = { rank: number; of: number; pct: number };

export type FixtureLite = {
    opp: string; home: boolean; difficulty: 1 | 2 | 3 | 4 | 5; kickoff?: string;
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
    form?: string;
    ict_index?: string;
    minutes?: number;
    ep_next?: string | null;
    points_per_game?: string;
    goals_scored?: number;
    assists?: number;
    clean_sheets?: number;
    saves?: number;
    bonus?: number;
    cost_change_event?: number;
    transfer_rank?: { rank: number; of: number };
    transfers_in_event?: number;
    transfers_out_event?: number;
    cost_change_start?: number;
    selected_by_percent?: string;
    start_probability: number;
    gw_points?: number;
    is_captain?: boolean; is_vice_captain?: boolean;
    fixture?: FixtureLite | null;
    has_dgw?: boolean;
    fixtures?: FixtureLite[];
    slot?: number; multiplier?: number;
    shirt_url?: string;
    ranks?: Partial<Record<"goals" | "assists" | "clean_sheets" | "ppg" | "saves", PlayerRank>>;
};

export type TransferSuggestion = {
    element: number;
    name: string;
    team: string | null;
    price: number;
    ep_next: string | null;
    form: string | null;
    score: number;
    start_probability: number;
    selected_by_percent: string | null;
    fixture: FixtureLite | null;
    has_dgw: boolean;
    shirt_url: string | null;
};

export type TransferSuggestionGroup = {
    position: 1 | 2 | 3 | 4;
    budget: number;
    players: TransferSuggestion[];
};

export type TransferSuggestionsResponse = {
    entry_id: number;
    bank: number;
    suggestions: TransferSuggestionGroup[];
};

export type SquadResponse = {
    entry_id: number;
    entry_name?: string;
    player_name?: string;
    overall_rank?: number | null;
    favourite_team?: string;
    season_status?: "pre_season" | "in_season";
    used_gw: number;
    current_gw: number;
    used_label: "next" | "current" | "explicit" | "live" | "pre_season";
    deadline: string;
    team_value: number | null;
    team_bank?: number | null;
    players: Player[];
    active_chip?: string | null;
};

export type FdrGwMeta = { id: number; name: string; deadline: string | null };

export type FdrTeam = {
    id: number;
    name: string;
    short_name: string;
    code: number;
    badge_url: string;
    gws: FixtureLite[][];
    avg_difficulty: number | null;
    fixture_count: number;
};

export type FdrGridResponse = {
    base_gw: number;
    gws: FdrGwMeta[];
    teams: FdrTeam[];
};