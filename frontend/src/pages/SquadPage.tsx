// import { useMemo, useState, useEffect } from "react";
// import { getLive, type CacheMeta, getSquad } from "../lib/api";
// import type { Player, SquadResponse } from "../lib/types";
// import PlayerCard from "../components/squad/PlayerCard";
// import CacheIndicators from "../components/ui/CacheIndicators";
// import DeadlineBanner from "../components/DeadlineBanner";
// import StatusStrip from "../components/StatusStrip";
// import { teamShortToLong } from "../lib/utils";
// import IdentityStrip from "../components/IndentityStrip";

// function benchLabel(p: Player) {
//     if ((p.slot ?? 0) === 12 || p.position === 1) return "GK";
//     const n = (p.slot ?? 0) - 11;            // 13->2, 14->3, 15->4
//     if (n >= 2 && n <= 4) return `B${n - 1}`; // B1..B3
//     return null;
// }

// export default function SquadPage() {
//     // NEW: state you were missing
//     const [entry, setEntry] = useState<number | ''>(() => {
//         const stored = localStorage.getItem("fpl-entry");
//         return stored ? Number(stored) : '';
//     });
//     const [data, setData] = useState<SquadResponse | null>(null);
//     const [error, setError] = useState<string | null>(null);
//     const [loading, setLoading] = useState(false);
//     const [cacheMeta, setCacheMeta] = useState<CacheMeta>({ status: null, ageSeconds: null });
//     const [envStatus, setEnvStatus] = useState<null | 'ok' | 'err'>(null);

//     const isLocal =
//         typeof window !== "undefined" &&
//         /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

//     const xi = useMemo(
//         () =>
//             (data?.players || [])
//                 .filter(p => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11)
//                 .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
//         [data]
//     );

//     const bench = useMemo(
//         () =>
//             (data?.players || [])
//                 .filter(p => !((p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11))
//                 .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)),
//         [data]
//     );

//     useEffect(() => {
//         if (entry) {
//             localStorage.setItem("fpl-entry", String(entry));
//         } else {
//             localStorage.removeItem("fpl-entry");
//         }
//     }, [entry]);

//     const info = data
//         ? `GW ${data.used_gw} • Deadline ${new Date(data.deadline).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })} • Team Value £${(data.team_value / 10).toFixed(1)}${data.team_bank != null ? ` • Bank £${(data.team_bank / 10).toFixed(1)}` : ""}${data.used_label === "live" ? " • Live" : ""}`
//         : "";

//     function warnText() {
//         const low = xi.filter(p => (p.start_probability || 0) < 0.60);
//         if (!low.length) return "";
//         const suggestions = low
//             .map(p => {
//                 const cand = bench
//                     .filter(b => b.position === p.position && (b.start_probability || 0) > (p.start_probability || 0))
//                     .sort((a, b) => (a.price || 0) - (b.price || 0))[0];
//                 return cand ? `${p.name} → ${cand.name}` : null;
//             })
//             .filter(Boolean) as string[];
//         return suggestions.length
//             ? `Heads up: low start% in XI. Try ${suggestions.join(", ")}.`
//             : `Heads up: at least one XI player has start% < 60%.`;
//     }

//     const loadSquad = async (forceRefresh = false) => {
//         if (!entry) return;
//         try {
//             setLoading(true);
//             setError(null);
//             const res = await getSquad(String(entry), { forceRefresh });
//             setData(res.data as SquadResponse);
//             setCacheMeta(res.cache);
//         } catch {
//             setError("Failed to load squad");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const loadLive = async (forceRefresh = false) => {
//         if (!entry) return;
//         try {
//             setLoading(true);
//             setError(null);
//             const res = await getLive(Number(entry), { forceRefresh });
//             setData(res.data as SquadResponse);
//             setCacheMeta(res.cache);
//         } catch {
//             setError("Failed to load live squad");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const reloadEnv = async () => {
//         try {
//             setEnvStatus(null);
//             const res = await fetch("/api/admin/reload-env", {
//                 method: "POST",
//                 credentials: "include",
//             });
//             if (!res.ok) throw new Error("reload failed");
//             setEnvStatus("ok");
//             setTimeout(() => setEnvStatus(null), 1500);
//         } catch {
//             setEnvStatus("err");
//             setTimeout(() => setEnvStatus(null), 2500);
//         }
//     };

//     return (
//         <div className="max-w-4xl mx-auto p-6 space-y-4">
//             {/* Title row */}
//             <div className="flex items-center justify-between">
//                 <h1 className="text-2xl font-bold">FPL Helper</h1>
//                 {/* Example spot for Settings button if you add it back */}
//                 {/* <button className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50">Settings</button> */}
//             </div>

//             {/* Deadline banner */}
//             {data && (
//                 <div className="sticky top-2 z-40">
//                     <DeadlineBanner gw={data.used_gw} deadlineISO={data.deadline} activeChip={data.active_chip} />
//                 </div>
//             )}

//             {/* Controls Card */}
//             <div className="rounded-xl border border-gray-200 bg-white p-3">
//                 <div className="flex flex-wrap items-center gap-2">
//                     <input
//                         value={entry}
//                         onChange={e => {
//                             const v = e.target.value;
//                             setEntry(v === '' ? '' : Number(v));
//                         }}
//                         placeholder="FPL entry ID"
//                         className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300"
//                         type="number"
//                         name="entry"
//                     />
//                     <button
//                         className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
//                         onClick={() => setEntry('')}
//                         disabled={loading}
//                     >
//                         Clear
//                     </button>
//                     <button
//                         className="px-3 py-2 rounded-lg border bg-black text-white disabled:opacity-50"
//                         onClick={() => loadSquad(false)}
//                         disabled={!entry || loading}
//                     >
//                         {loading ? "Loading…" : "Load Squad"}
//                     </button>
//                     <button
//                         className="px-3 py-2 rounded-lg border bg-black text-white disabled:opacity-50"
//                         onClick={() => loadLive(false)}
//                         disabled={!entry || loading}
//                     >
//                         {loading ? "Loading…" : "Load Live"}
//                     </button>
//                     <button
//                         className="px-3 py-2 rounded-lg border bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
//                         onClick={() => loadLive(true)}
//                         disabled={!entry || loading}
//                         title="Force a fresh fetch (ignore short cache)"
//                     >
//                         Refresh (no cache)
//                     </button>

//                     {isLocal && (
//                         <div className="flex items-center gap-2 ml-auto">
//                             <button
//                                 className="px-3 py-2 rounded-lg border border-dashed bg-white hover:bg-gray-50 disabled:opacity-50"
//                                 onClick={reloadEnv}
//                                 disabled={loading}
//                                 title="Re-read .env (dev)"
//                             >
//                                 Reload .env
//                             </button>
//                             {envStatus === "ok" && (
//                                 <span className="text-xs inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
//                                     ✓ Reloaded
//                                 </span>
//                             )}
//                             {envStatus === "err" && (
//                                 <span className="text-xs inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700">
//                                     ✕ Failed
//                                 </span>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </div>

//             {/* Identity strip (entry name / manager / OR / fav team) */}
//             {data && (
//                 <IdentityStrip
//                     entryName={data.entry_name}
//                     manager={data.player_name}
//                     overallRank={data.overall_rank ?? null}
//                     favouriteTeam={data.favourite_team ?? null}
//                 />
//             )}

//             {/* Status strip: cache / warnings / errors */}
//             {data && (<StatusStrip
//                 cache={cacheMeta}
//                 warning={data ? (function () {
//                     const t = (function warnText() {
//                         const low = xi.filter(p => (p.start_probability || 0) < 0.60);
//                         if (!low.length) return "";
//                         const suggestions = low
//                             .map(p => {
//                                 const cand = bench
//                                     .filter(b => b.position === p.position && (b.start_probability || 0) > (p.start_probability || 0))
//                                     .sort((a, b) => (a.price || 0) - (b.price || 0))[0];
//                                 return cand ? `${p.name} → ${cand.name}` : null;
//                             })
//                             .filter(Boolean) as string[];
//                         return suggestions.length
//                             ? `Low start% in XI. Try ${suggestions.join(", ")}.`
//                             : `At least one XI player has start% < 60%.`;
//                     })(); return t || null;
//                 }()) : null}
//                 error={error}
//             />)}

//             {/* Info line */}
//             {data && (
//                 <div className="text-sm text-gray-600">
//                     GW {data.used_gw} • Team Value £{(data.team_value / 10).toFixed(1)}
//                     {data.team_bank != null ? ` • Bank £${(data.team_bank / 10).toFixed(1)}` : ""}
//                     {data.used_label === "live" ? " • Live" : ""}
//                 </div>
//             )}

//             {xi.length > 0 && <div className="text-sm text-muted font-semibold mt-4 mb-2">Starting XI</div>}
//             {xi.map(p => <PlayerCard key={p.element} p={p} />)}

//             {bench.length > 0 && <div className="text-sm text-muted font-semibold mt-4 mb-2">Bench</div>}
//             {bench.map(p => <PlayerCard key={p.element} p={p} benchBadge={benchLabel(p)} />)}
//         </div>
//     );
// }