"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { currentWeek, games, picks as historicalPicks, players as demoPlayers, season, seededCurrentPick } from "@/lib/demo-data";
import { formatKickoff, formatPoints, formatSpread } from "@/lib/format";
import { getOpponent, getUnderdog, hasGameStarted, potentialPoints } from "@/lib/scoring";
import { buildStandings } from "@/lib/standings";
import { getTeam } from "@/lib/teams";
import type { Game, Pick, PickAuditEvent, Player } from "@/lib/types";

type Tab = "pick" | "week" | "standings" | "history" | "profile" | "admin";

type OddsSummary = {
  liveOddsGames: number;
  totalGames: number;
  latestFetchedAt: string | null;
  creditsUsedThisWindow: number;
  lastRefreshStatus: string | null;
  lastRefreshAt: string | null;
  lastRefreshNotes: string | null;
  requestsRemaining: string | null;
  requestsUsed: string | null;
};

const navItems: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: "pick", label: "Pick", icon: Shield },
  { tab: "week", label: "Week", icon: CalendarDays },
  { tab: "standings", label: "Standings", icon: Trophy },
  { tab: "history", label: "History", icon: BarChart3 },
  { tab: "admin", label: "Admin", icon: Lock },
];

const playerStorageKey = "nfl-underdog-selected-player";
const adminStorageKey = "nfl-underdog-admin-key";
const weekOneWindow = {
  commenceTimeFrom: "2026-09-09T00:00:00Z",
  commenceTimeTo: "2026-09-16T04:00:00Z",
};

export function AppShell() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [activeTab, setActiveTab] = useState<Tab>("pick");
  const [roster, setRoster] = useState<Player[]>(supabaseConfigured ? [] : demoPlayers);
  const [activePlayers, setActivePlayers] = useState<Player[]>(supabaseConfigured ? [] : demoPlayers);
  const [currentUserId, setCurrentUserId] = useState(() =>
    supabaseConfigured && typeof window !== "undefined"
      ? window.localStorage.getItem(playerStorageKey) ?? ""
      : demoPlayers[0].id,
  );
  const [allPicks, setAllPicks] = useState<Pick[]>(supabaseConfigured ? [] : [...historicalPicks, seededCurrentPick]);
  const [auditEvents, setAuditEvents] = useState<PickAuditEvent[]>([]);
  const [weekGames, setWeekGames] = useState<Game[]>(supabaseConfigured ? [] : games);
  const [pendingGame, setPendingGame] = useState<Game | null>(null);
  const [oddsMode, setOddsMode] = useState<"demo" | "live" | "error">("demo");
  const [oddsStatus, setOddsStatus] = useState(supabaseConfigured ? "Loading DraftKings odds status..." : "Local demo mode with fixture odds.");
  const [oddsSummary, setOddsSummary] = useState<OddsSummary | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(supabaseConfigured);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [adminKey, setAdminKeyState] = useState(() =>
    supabaseConfigured && typeof window !== "undefined"
      ? window.localStorage.getItem(adminStorageKey) ?? ""
      : "",
  );
  const [dataMode, setDataMode] = useState<"demo" | "supabase">(supabaseConfigured ? "supabase" : "demo");
  const [playerReady] = useState(true);
  const isAdmin = dataMode === "demo" ? currentUserId === demoPlayers[0].id : Boolean(adminKey);
  const visibleRoster = useMemo(() => roster.filter((player) => player.active !== false), [roster]);
  const currentUser = visibleRoster.find((player) => player.id === currentUserId);
  const selectedPlayerIsActive = activePlayers.some((player) => player.id === currentUserId);
  const selectedPlayer = currentUser && selectedPlayerIsActive ? currentUser : null;
  const visibleNavItems = navItems.filter((item) => (item.tab === "admin" ? isAdmin : Boolean(selectedPlayer)));
  const activeView = activeTab === "admin" && !isAdmin ? "profile" : activeTab;
  const myCurrentPick = selectedPlayer ? allPicks.find((pick) => pick.userId === selectedPlayer.id && pick.week === currentWeek) : undefined;
  const revealed = Boolean(myCurrentPick);
  const standings = useMemo(() => buildStandings(visibleRoster, allPicks), [visibleRoster, allPicks]);
  const showSelector = supabaseConfigured && playerReady && !selectedPlayer && activeView !== "admin" && activeView !== "profile";
  const showLeague = !supabaseConfigured || Boolean(selectedPlayer) || activeView === "admin" || activeView === "profile";

  useEffect(() => {
    if (!supabaseConfigured) return;

    void loadLeagueData(currentUserId);
    // This bootstrap should only run once for the selected deployment mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseConfigured]);

  async function loadLeagueData(selectedId = currentUserId) {
    if (!supabaseConfigured) return;
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const response = await fetch("/api/league", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to load league data.");

      const players = Array.isArray(payload.players) ? payload.players : [];
      const visiblePlayers = players.filter((player: Player) => player.active !== false);
      const active = Array.isArray(payload.activePlayers) ? payload.activePlayers.filter((player: Player) => player.active !== false) : visiblePlayers;
      setRoster(visiblePlayers);
      setActivePlayers(active);
      setWeekGames(Array.isArray(payload.games) ? payload.games.sort(sortByKickoff) : []);
      setAllPicks(Array.isArray(payload.picks) ? payload.picks : []);
      setAuditEvents(Array.isArray(payload.auditEvents) ? payload.auditEvents.map(toAuditEvent) : []);
      setDataMode("supabase");
      setOddsSummary(payload.oddsSummary ?? null);

      if (selectedId && !active.some((player: Player) => player.id === selectedId)) {
        window.localStorage.removeItem(playerStorageKey);
        setCurrentUserId("");
      }

      const liveOddsGames = Number(payload.oddsSummary?.liveOddsGames ?? 0);
      const totalGames = Number(payload.oddsSummary?.totalGames ?? 0);
      if (totalGames > 0 && liveOddsGames === totalGames) {
        setOddsMode("live");
        setOddsStatus(`DraftKings odds loaded for all ${totalGames} games. Updated ${formatAge(payload.oddsSummary?.latestFetchedAt)}.`);
      } else if (totalGames > 0) {
        setOddsMode("error");
        setOddsStatus(`DraftKings line currently unavailable for ${totalGames - liveOddsGames} of ${totalGames} games.`);
      } else {
        setOddsMode("error");
        setOddsStatus("No games are loaded for the current week.");
      }
    } catch (error) {
      setLeagueError(error instanceof Error ? error.message : "Unable to load league data.");
      setOddsMode("error");
    } finally {
      setLeagueLoading(false);
    }
  }

  function choosePlayer(playerId: string) {
    setCurrentUserId(playerId);
    window.localStorage.setItem(playerStorageKey, playerId);
    setActiveTab("pick");
  }

  function switchPlayer() {
    setCurrentUserId("");
    window.localStorage.removeItem(playerStorageKey);
    setActiveTab("profile");
  }

  function setAdminKey(value: string) {
    setAdminKeyState(value);
    if (value) window.localStorage.setItem(adminStorageKey, value);
    else window.localStorage.removeItem(adminStorageKey);
  }

  async function confirmPick(game: Game) {
    if (!selectedPlayer && dataMode === "supabase") {
      setLeagueError("Choose your name before making a pick.");
      return;
    }

    const underdog = getUnderdog(game);
    if (!underdog) return;
    setLeagueError(null);

    if (dataMode === "supabase") {
      const response = await fetch("/api/picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          participantId: selectedPlayer?.id,
          season,
          week: currentWeek,
          gameId: game.id,
          selectedTeamId: underdog.teamId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLeagueError(payload.error ?? "Unable to submit pick.");
        setPendingGame(null);
        return;
      }
      await loadLeagueData(selectedPlayer?.id);
      setPendingGame(null);
      setActiveTab("week");
      return;
    }

    const nextPick: Pick = {
      id: `p-${Date.now()}`,
      userId: currentUserId,
      season,
      week: currentWeek,
      gameId: game.id,
      selectedTeamId: underdog.teamId,
      opponentTeamId: getOpponent(game, underdog.teamId),
      submittedSpread: underdog.spread,
      submittedAt: new Date().toISOString(),
      result: "pending",
      pointsEarned: 0,
      locked: hasGameStarted(game),
    };
    setAllPicks((existing) => [
      ...existing.filter((pick) => !(pick.userId === currentUserId && pick.week === currentWeek)),
      nextPick,
    ]);
    setPendingGame(null);
    setActiveTab("week");
  }

  async function refreshOdds() {
    if (dataMode === "supabase" && !adminKey) {
      setOddsMode("error");
      setOddsStatus("Enter the admin key in Profile before refreshing odds.");
      return;
    }

    setOddsStatus("Refreshing DraftKings lines...");
    try {
      const response = await fetch("/api/odds", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(weekOneWindow),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Odds refresh failed");
      await loadLeagueData(currentUserId);
      const persistedMessage = payload.persisted
        ? `Persisted ${payload.persisted.oddsInserted} odds rows across ${payload.persisted.gamesUpserted} games.`
        : "Odds were fetched but not persisted because Supabase service credentials are missing.";
      setOddsMode("live");
      setOddsStatus(`Fetched ${Array.isArray(payload.games) ? payload.games.length : 0} DraftKings games. ${persistedMessage} Remaining quota: ${payload.requestsRemaining ?? "unknown"}.`);
    } catch (error) {
      setOddsMode("error");
      setOddsStatus(error instanceof Error ? error.message : "Odds refresh failed.");
      await loadLeagueData(currentUserId);
    }
  }

  async function addPlayer(displayName: string) {
    const cleanName = displayName.trim();
    if (!cleanName) return;

    if (dataMode === "demo") {
      const id = `manual-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
      const player = {
        id,
        displayName: cleanName,
        avatarUrl: initials(cleanName),
        role: "player" as const,
        active: true,
      };
      setRoster((existing) => [...existing, player]);
      setActivePlayers((existing) => [...existing, player]);
      return;
    }

    const response = await fetch("/api/players", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ displayName: cleanName }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLeagueError(payload.error ?? "Unable to add player.");
      return;
    }
    await loadLeagueData(currentUserId);
  }

  async function setPlayerActive(playerId: string, active: boolean) {
    if (dataMode !== "supabase") return;
    const response = await fetch("/api/players", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ id: playerId, active }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLeagueError(payload.error ?? "Unable to update player.");
      return;
    }
    await loadLeagueData(currentUserId);
  }

  return (
    <div className="min-h-screen bg-[#080c12] text-white">
      <div className="fixed inset-x-0 top-0 z-20 border-b border-white/10 bg-[#080c12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button className="flex items-center gap-3" onClick={() => setActiveTab(selectedPlayer ? "pick" : "profile")} aria-label="Pick board">
            <div className="flex h-11 w-11 items-center justify-center rounded bg-red-600 shadow-[0_0_28px_rgba(227,24,55,0.35)]">
              <Shield className="h-6 w-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">NFL Underdog</p>
              <h1 className="text-xl font-black uppercase leading-none">Pick&apos;em</h1>
            </div>
          </button>
          <div className="hidden items-center gap-2 md:flex">
            {visibleNavItems.map((item) => (
              <NavButton key={item.tab} {...item} active={activeView === item.tab} onClick={() => setActiveTab(item.tab)} />
            ))}
          </div>
          <button
            className="flex h-11 items-center gap-2 rounded border border-white/10 bg-white/5 px-3 text-sm font-bold"
            onClick={() => setActiveTab("profile")}
          >
            <Avatar value={selectedPlayer?.avatarUrl ?? selectedPlayer?.displayName[0] ?? "?"} />
            <span className="hidden sm:inline">{selectedPlayer?.displayName ?? "Choose Player"}</span>
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 md:pb-10">
        {leagueLoading && (
          <div className="mb-5 rounded border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-slate-200">
            Loading league...
          </div>
        )}
        {leagueError && (
          <div className="mb-5 rounded border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">
            {leagueError}
          </div>
        )}
        {!supabaseConfigured && (
          <div className="mb-5 rounded border border-amber-400/25 bg-amber-400/10 p-3 text-sm font-bold text-amber-100">
            Local demo mode. Production uses only manually configured Supabase participants.
          </div>
        )}

        {showSelector && (
          <PlayerSelector activePlayers={activePlayers} onChoose={choosePlayer} />
        )}

        {showLeague && !showSelector && (
          <>
            {activeView === "pick" && selectedPlayer && (
              <PickScreen
                myPick={myCurrentPick}
                weekGames={weekGames}
                oddsMode={oddsMode}
                oddsStatus={oddsStatus}
                onSelect={setPendingGame}
              />
            )}
            {activeView === "week" && <WeekScreen allPicks={allPicks} roster={visibleRoster} revealed={revealed} />}
            {activeView === "standings" && <StandingsScreen standings={standings} />}
            {activeView === "history" && <HistoryScreen allPicks={allPicks} roster={visibleRoster} auditEvents={auditEvents} />}
            {activeView === "profile" && (
              <ProfileScreen
                activePlayers={activePlayers}
                currentPlayer={selectedPlayer}
                adminKey={adminKey}
                setAdminKey={setAdminKey}
                onChoose={choosePlayer}
                onSwitchPlayer={switchPlayer}
                dataMode={dataMode}
              />
            )}
            {activeView === "admin" && isAdmin && (
              <AdminScreen
                oddsStatus={oddsStatus}
                oddsMode={oddsMode}
                oddsSummary={oddsSummary}
                roster={visibleRoster}
                activePlayers={activePlayers}
                weekGames={weekGames}
                addPlayer={addPlayer}
                refreshOdds={refreshOdds}
                setPlayerActive={setPlayerActive}
                dataMode={dataMode}
              />
            )}
          </>
        )}
      </main>

      {showLeague && visibleNavItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#080c12]/95 px-2 py-2 backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-2xl gap-1" style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}>
            {visibleNavItems.map((item) => (
              <MobileNavButton key={item.tab} {...item} active={activeView === item.tab} onClick={() => setActiveTab(item.tab)} />
            ))}
          </div>
        </div>
      )}

      {pendingGame && <ConfirmPick game={pendingGame} onBack={() => setPendingGame(null)} onConfirm={() => confirmPick(pendingGame)} />}
    </div>
  );
}

function PlayerSelector({ activePlayers, onChoose }: { activePlayers: Player[]; onChoose: (playerId: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageIntro eyebrow="Player" title="Who Are You?" detail="Choose your name once. This browser will remember it for next time." />
      {activePlayers.length === 0 ? (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 p-5 text-amber-100">
          No active players have been added yet. Ask the pool admin to open Profile, enter the admin key, and add participants in Admin.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {activePlayers.map((player) => (
            <button
              key={player.id}
              className="flex items-center gap-4 rounded border border-white/10 bg-white/[0.04] p-4 text-left hover:border-red-400/60 hover:bg-red-500/10"
              onClick={() => onChoose(player.id)}
            >
              <Avatar value={player.avatarUrl ?? player.displayName[0]} large />
              <span className="text-2xl font-black">{player.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PickScreen({
  myPick,
  weekGames,
  oddsMode,
  oddsStatus,
  onSelect,
}: {
  myPick?: Pick;
  weekGames: Game[];
  oddsMode: "demo" | "live" | "error";
  oddsStatus: string;
  onSelect: (game: Game) => void;
}) {
  const chronologicalGames = [...weekGames].sort(sortByKickoff);
  const selectedGame = myPick ? weekGames.find((game) => game.id === myPick.gameId) : null;
  const existingPickLocked = Boolean(myPick && (myPick.locked || (selectedGame && hasGameStarted(selectedGame))));

  return (
    <div className="space-y-6">
      <PageIntro eyebrow={`2026 Week ${currentWeek}`} title="Choose One Underdog" detail="All games are listed chronologically. Games lock automatically at kickoff." />
      {myPick && !existingPickLocked && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          Change Pick is open until the game you already picked kicks off. Your previous spread snapshot stays in the audit history.
        </div>
      )}
      {existingPickLocked && (
        <div className="rounded border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          Your pick is locked because its game has kicked off.
        </div>
      )}
      <div className={`rounded border p-4 text-sm ${oddsMode === "live" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
        <div className="flex items-start gap-3">
          {oddsMode === "live" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{oddsStatus}</p>
        </div>
      </div>
      {chronologicalGames.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/[0.04] p-5 text-slate-300">No games are loaded for this week.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {chronologicalGames.map((game) => (
            <MatchupCard
              key={game.id}
              game={game}
              selected={myPick?.gameId === game.id}
              selectionLocked={existingPickLocked}
              onSelect={() => onSelect(game)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchupCard({
  game,
  selected,
  selectionLocked,
  onSelect,
}: {
  game: Game;
  selected?: boolean;
  selectionLocked?: boolean;
  onSelect: () => void;
}) {
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);
  const underdog = getUnderdog(game);
  const locked = hasGameStarted(game);
  const underdogTeam = underdog ? getTeam(underdog.teamId) : null;
  const hasOdds = typeof game.homeSpread === "number" && typeof game.awaySpread === "number";

  return (
    <article className={`rounded border p-4 ${selected ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-white/[0.045]"}`}>
      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <TeamRow teamId={away.id} spread={game.awaySpread} underdog={underdog?.teamId === away.id} />
        <span className="hidden text-sm font-black text-slate-500 sm:inline">@</span>
        <TeamRow teamId={home.id} spread={game.homeSpread} underdog={underdog?.teamId === home.id} />
      </div>
      <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{formatKickoff(game.kickoffAt)}</p>
          <p className="mt-1 text-sm text-slate-300">{game.venue} · {game.broadcast}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            DraftKings · {hasOdds ? `Updated ${formatAge(game.lastOddsUpdate)}` : "Line currently unavailable"}
          </p>
        </div>
        {underdog && underdogTeam ? (
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Underdog</p>
            <p className="text-2xl font-black text-emerald-300">{underdogTeam.abbreviation} {formatSpread(underdog.spread)}</p>
          </div>
        ) : (
          <p className="text-sm font-bold text-slate-400">DraftKings line currently unavailable</p>
        )}
      </div>
      <button
        disabled={!underdog || locked || selectionLocked}
        onClick={onSelect}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded bg-red-600 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {locked || selectionLocked ? <Lock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {selectionLocked ? "Pick Locked" : locked ? "Locked" : selected ? "Change Pick" : underdogTeam ? `Pick ${underdogTeam.abbreviation}` : "Unavailable"}
      </button>
    </article>
  );
}

function ConfirmPick({ game, onBack, onConfirm }: { game: Game; onBack: () => void; onConfirm: () => void }) {
  const underdog = getUnderdog(game);
  if (!underdog) return null;
  const team = getTeam(underdog.teamId);
  const opponent = getTeam(getOpponent(game, underdog.teamId));
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/70 p-4 backdrop-blur sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded border border-white/10 bg-[#111820] p-5 shadow-2xl">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-red-400">Your Week {currentWeek} Pick</p>
        <div className="mt-5 flex items-center gap-4">
          <TeamLockup teamId={team.id} size="lg" />
          <div>
            <h3 className="text-3xl font-black">{team.fullName} {formatSpread(underdog.spread)}</h3>
            <p className="text-slate-300">vs {opponent.fullName}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label="If They Win" value={formatPoints(potentialPoints(underdog.spread))} detail="Outright only" />
          <Metric label="Kickoff" value={formatKickoff(game.kickoffAt)} detail="Server time locks picks" />
        </div>
        <p className="mt-4 rounded border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          The DraftKings spread is snapshotted at {formatSpread(underdog.spread)} when you confirm.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="h-12 rounded border border-white/10 font-bold" onClick={onBack}>Go Back</button>
          <button className="h-12 rounded bg-emerald-500 font-black text-black" onClick={onConfirm}>Confirm Pick</button>
        </div>
      </div>
    </div>
  );
}

function WeekScreen({ allPicks, roster, revealed }: { allPicks: Pick[]; roster: Player[]; revealed: boolean }) {
  return (
    <div className="space-y-6">
      <PageIntro eyebrow={`2026 Week ${currentWeek}`} title="Weekly Picks" detail="The board shows each player and their submitted pick for this week." />
      <WeeklyPicks allPicks={allPicks} roster={roster} revealed={revealed} />
    </div>
  );
}

function StandingsScreen({ standings }: { standings: ReturnType<typeof buildStandings> }) {
  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Season" title="Standings" detail="Tie-breakers: total points, winning picks, highest single-week score." />
      {standings.length === 0 ? (
        <div className="rounded border border-white/10 bg-white/[0.04] p-5 text-slate-300">No players have been added yet.</div>
      ) : (
        <div className="overflow-hidden rounded border border-white/10">
          {standings.map((standing, index) => (
            <div key={standing.player.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-white/10 bg-white/[0.04] p-4 last:border-b-0 sm:grid-cols-[72px_1fr_repeat(3,auto)]">
              <p className="text-2xl font-black text-slate-400">{index + 1}</p>
              <div className="flex items-center gap-3">
                <Avatar value={standing.player.avatarUrl ?? standing.player.displayName[0]} />
                <div>
                  <p className="font-black">{standing.player.displayName}</p>
                  <p className="text-sm text-slate-400">{standing.wins}-{standing.losses} · {(standing.winPercentage * 100).toFixed(0)}%{standing.player.active === false ? " · inactive" : ""}</p>
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-300">{formatPoints(standing.totalPoints)}</p>
              <StatCell label="Best" value={standing.biggestWin.toFixed(1)} />
              <StatCell label="Wins" value={String(standing.wins)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryScreen({ allPicks, roster, auditEvents }: { allPicks: Pick[]; roster: Player[]; auditEvents: PickAuditEvent[] }) {
  const weeks = [...new Set([currentWeek, ...allPicks.map((pick) => pick.week)])].sort((a, b) => a - b);
  const [selectedWeek, setSelectedWeek] = useState(weeks.at(-1) ?? currentWeek);
  const changedPickIds = new Set(auditEvents.filter((event) => event.actionType === "changed").map((event) => event.pickId));
  const weekPicks = allPicks.filter((pick) => pick.week === selectedWeek);

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Season" title="Pick History" detail="Stored pick snapshots are used here; current odds do not rewrite old weeks." />
      <div className="flex flex-wrap gap-2">
        {weeks.map((week) => (
          <button
            key={week}
            className={`h-10 rounded px-4 text-sm font-black ${selectedWeek === week ? "bg-white text-black" : "bg-white/10 text-slate-300"}`}
            onClick={() => setSelectedWeek(week)}
          >
            Week {week}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded border border-white/10 bg-white/[0.035]">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="p-4">Player</th>
              <th className="p-4">Final Pick</th>
              <th className="p-4">Result</th>
              <th className="p-4">Points</th>
              <th className="p-4">Submitted</th>
              <th className="p-4">Changed</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((player) => {
              const pick = weekPicks.find((item) => item.userId === player.id);
              return (
                <tr key={player.id} className="border-t border-white/10">
                  <td className="p-4 font-black">{player.displayName}{player.active === false ? <span className="ml-2 text-xs text-slate-500">Inactive</span> : null}</td>
                  <td className="p-4">{pick ? <PickPill pick={pick} /> : <span className="text-slate-500">No pick</span>}</td>
                  <td className="p-4 uppercase text-slate-300">{pick?.result ?? "-"}</td>
                  <td className="p-4 text-lg font-black text-emerald-300">{pick ? formatPoints(pick.pointsEarned) : "-"}</td>
                  <td className="p-4 text-slate-300">{pick ? formatTimestamp(pick.submittedAt) : "-"}</td>
                  <td className="p-4 text-slate-300">{pick && (pick.changed || changedPickIds.has(pick.id)) ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileScreen({
  activePlayers,
  currentPlayer,
  adminKey,
  setAdminKey,
  onChoose,
  onSwitchPlayer,
  dataMode,
}: {
  activePlayers: Player[];
  currentPlayer: Player | null;
  adminKey: string;
  setAdminKey: (value: string) => void;
  onChoose: (playerId: string) => void;
  onSwitchPlayer: () => void;
  dataMode: "demo" | "supabase";
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <PageIntro eyebrow="Profile" title={currentPlayer ? "Your Player" : "Choose Player"} detail="This browser remembers the selected player until you switch." />
      {currentPlayer ? (
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-4">
            <Avatar value={currentPlayer.avatarUrl ?? currentPlayer.displayName[0]} large />
            <div>
              <p className="text-2xl font-black">{currentPlayer.displayName}</p>
              <p className="text-slate-400">{currentPlayer.active === false ? "Inactive" : "Active player"}</p>
            </div>
          </div>
          <button className="mt-5 h-12 rounded border border-white/10 px-5 font-black" onClick={onSwitchPlayer}>Switch Player</button>
        </div>
      ) : (
        <PlayerSelector activePlayers={activePlayers} onChoose={onChoose} />
      )}
      {dataMode === "supabase" && (
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-300" />
            <h3 className="text-2xl font-black">Admin Access</h3>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-3 outline-none"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Admin key"
              type="password"
              aria-label="Admin key"
            />
            <button className="h-11 rounded bg-white px-4 font-black text-black" onClick={() => setAdminKey("")}>Clear</button>
          </div>
          <p className="mt-3 text-sm text-slate-400">Enter the admin key only when you need roster or odds controls.</p>
        </div>
      )}
    </div>
  );
}

function AdminScreen({
  oddsStatus,
  oddsMode,
  oddsSummary,
  roster,
  activePlayers,
  weekGames,
  addPlayer,
  refreshOdds,
  setPlayerActive,
  dataMode,
}: {
  oddsStatus: string;
  oddsMode: "demo" | "live" | "error";
  oddsSummary: OddsSummary | null;
  roster: Player[];
  activePlayers: Player[];
  weekGames: Game[];
  addPlayer: (displayName: string) => Promise<void>;
  refreshOdds: () => Promise<void>;
  setPlayerActive: (playerId: string, active: boolean) => Promise<void>;
  dataMode: "demo" | "supabase";
}) {
  const [newPlayerName, setNewPlayerName] = useState("");
  async function submitPlayer() {
    await addPlayer(newPlayerName);
    setNewPlayerName("");
  }

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Admin" title="League Control Room" detail="Manage players and refresh DraftKings lines." />
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Odds Source</p>
              <h3 className="mt-1 text-2xl font-black">DraftKings</h3>
            </div>
            <button className="flex h-11 items-center gap-2 rounded bg-emerald-400 px-4 font-black text-black" onClick={refreshOdds}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <p className="mt-4 rounded border border-white/10 bg-black/25 p-3 text-sm text-slate-300">{oddsStatus}</p>
          <p className={`mt-3 inline-flex rounded px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${oddsMode === "live" ? "bg-emerald-400 text-black" : "bg-amber-300 text-black"}`}>
            {oddsMode === "live" ? "Current DraftKings" : "Needs attention"}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Updated Games" value={`${oddsSummary?.liveOddsGames ?? 0}/${oddsSummary?.totalGames ?? weekGames.length}`} detail="With Odds API rows" />
            <Metric label="Budget Used" value={String(oddsSummary?.creditsUsedThisWindow ?? 0)} detail="Rolling 30-day credits" />
            <Metric label="Last Refresh" value={formatAge(oddsSummary?.lastRefreshAt)} detail={oddsSummary?.lastRefreshStatus ?? "No refresh logged"} />
            <Metric label="Remaining" value={oddsSummary?.requestsRemaining ?? "Unknown"} detail="Provider header" />
          </div>
          {oddsSummary?.lastRefreshNotes && <p className="mt-4 rounded border border-white/10 bg-black/25 p-3 text-sm text-slate-300">{oddsSummary.lastRefreshNotes}</p>}
        </div>
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">League Players</p>
          <div className="mt-4 flex gap-2">
            <input
              className="h-11 min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-3 outline-none"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="Friend name"
              aria-label="Friend name"
            />
            <button className="flex h-11 items-center gap-2 rounded bg-white px-4 font-black text-black" onClick={submitPlayer}>
              <UserPlus className="h-4 w-4" />
              Add
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-400">{activePlayers.length} active of {roster.length} total players.</p>
          <div className="mt-4 space-y-2">
            {roster.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-3">
                  <Avatar value={player.avatarUrl ?? player.displayName[0]} />
                  <div>
                    <p className="font-black">{player.displayName}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{player.active === false ? "Inactive" : "Active"}</p>
                  </div>
                </div>
                {dataMode === "supabase" && (
                  <button
                    className="h-10 rounded border border-white/10 px-3 text-sm font-black"
                    onClick={() => setPlayerActive(player.id, player.active === false)}
                  >
                    {player.active === false ? "Reactivate" : "Deactivate"}
                  </button>
                )}
              </div>
            ))}
            {roster.length === 0 && (
              <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                No players yet. Add the first participant above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyPicks({ allPicks, roster, revealed }: { allPicks: Pick[]; roster: Player[]; revealed: boolean }) {
  const currentPicks = allPicks.filter((pick) => pick.week === currentWeek);
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-black">Week {currentWeek} Picks</h3>
        {!revealed && <Lock className="h-5 w-5 text-amber-300" />}
      </div>
      <div className="mt-4 space-y-3">
        {roster.map((player) => {
          const pick = currentPicks.find((item) => item.userId === player.id);
          return (
            <div key={player.id} className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-3">
                <Avatar value={player.avatarUrl ?? player.displayName[0]} />
                <p className="font-bold">{player.displayName}{player.active === false ? <span className="ml-2 text-xs text-slate-500">Inactive</span> : null}</p>
              </div>
              {revealed && pick ? <PickPill pick={pick} /> : <p className="text-sm text-slate-500">Pick not submitted</p>}
            </div>
          );
        })}
        {roster.length === 0 && <p className="text-sm text-slate-400">No players have been added yet.</p>}
      </div>
      {!revealed && <p className="mt-4 rounded bg-amber-300/10 p-3 text-sm text-amber-100">Submit your Week {currentWeek} pick to unlock everyone else&apos;s selections on this screen.</p>}
    </section>
  );
}

function PickPill({ pick }: { pick: Pick }) {
  const team = getTeam(pick.selectedTeamId);
  const opponent = getTeam(pick.opponentTeamId);
  const tone = pick.result === "win" ? "bg-emerald-400/15 text-emerald-200" : pick.result === "loss" ? "bg-red-500/15 text-red-200" : "bg-slate-500/15 text-slate-200";
  const marker = pick.result === "win" ? "WIN" : pick.result === "loss" ? "LOSS" : "PENDING";
  return (
    <span className={`inline-flex flex-wrap items-center justify-end gap-2 rounded px-3 py-2 text-xs font-black ${tone}`}>
      {team.abbreviation} {formatSpread(pick.submittedSpread)} vs {opponent.abbreviation}
      {pick.changed && <span>CHANGED</span>}
      <span>{marker}</span>
      <span>{formatPoints(pick.pointsEarned)}</span>
    </span>
  );
}

function TeamRow({ teamId, spread, underdog }: { teamId: string; spread?: number; underdog?: boolean }) {
  const team = getTeam(teamId);
  return (
    <div className="min-w-0 flex-1">
      <TeamLockup teamId={team.id} />
      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded px-2 py-1 text-sm font-black ${underdog ? "bg-emerald-400 text-black" : "bg-white/10 text-slate-300"}`}>
          {typeof spread === "number" ? formatSpread(spread) : "N/A"}
        </span>
        {underdog && <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Underdog</span>}
      </div>
    </div>
  );
}

function TeamLockup({ teamId, size = "md" }: { teamId: string; size?: "md" | "lg" }) {
  const team = getTeam(teamId);
  const logoSize = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${logoSize} shrink-0 object-contain`} src={team.logoUrl} alt={`${team.fullName} logo`} />
      <div className="min-w-0">
        <p className="truncate text-base font-black">{team.fullName}</p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{team.abbreviation}</p>
      </div>
    </div>
  );
}

function NavButton({ label, icon: Icon, active, onClick }: { tab: Tab; label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button title={label} className={`flex h-10 items-center gap-2 rounded px-3 text-sm font-bold ${active ? "bg-white text-black" : "text-slate-300 hover:bg-white/10"}`} onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MobileNavButton({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button title={label} className={`flex h-12 flex-col items-center justify-center rounded text-[10px] font-bold ${active ? "bg-white text-black" : "text-slate-400"}`} onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function PageIntro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <section>
      <p className="text-sm font-black uppercase tracking-[0.28em] text-red-400">{eyebrow}</p>
      <h2 className="mt-2 text-4xl font-black uppercase sm:text-5xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-slate-300">{detail}</p>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden min-w-16 text-right sm:block">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}

function Avatar({ value, large }: { value: string; large?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded bg-white text-black ${large ? "h-16 w-16 text-xl" : "h-9 w-9 text-sm"} font-black`}>
      {value.slice(0, 2)}
    </span>
  );
}

function sortByKickoff(a: Game, b: Game) {
  return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
}

function formatAge(value?: string | null) {
  if (!value) return "never";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toAuditEvent(event: {
  pick_id: string;
  participant_id: string;
  week_number: number;
  action_type: PickAuditEvent["actionType"];
  changed_at: string;
}): PickAuditEvent {
  return {
    pickId: event.pick_id,
    participantId: event.participant_id,
    week: event.week_number,
    actionType: event.action_type,
    changedAt: event.changed_at,
  };
}
