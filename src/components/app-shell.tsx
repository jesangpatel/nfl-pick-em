"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  Lock,
  RefreshCw,
  Shield,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { currentWeek, games, picks as historicalPicks, players as demoPlayers, season, seededCurrentPick } from "@/lib/demo-data";
import { formatKickoff, formatPoints, formatSpread } from "@/lib/format";
import { getOpponent, getUnderdog, hasGameStarted, potentialPoints } from "@/lib/scoring";
import { buildChart, buildStandings } from "@/lib/standings";
import { createClient } from "@/lib/supabase/client";
import { getTeam } from "@/lib/teams";
import type { Game, Pick, Player } from "@/lib/types";

type Tab = "pick" | "week" | "standings" | "history" | "profile" | "admin";

const navItems: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: "pick", label: "Pick", icon: Shield },
  { tab: "week", label: "Week", icon: CalendarDays },
  { tab: "standings", label: "Standings", icon: Trophy },
  { tab: "history", label: "History", icon: BarChart3 },
  { tab: "admin", label: "Admin", icon: Lock },
];

const lineColors = ["#e31837", "#23a6f0", "#f9c74f", "#52d273"];
const weekOneWindow = {
  commenceTimeFrom: "2026-09-09T00:00:00Z",
  commenceTimeTo: "2026-09-16T04:00:00Z",
};

export function AppShell() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [activeTab, setActiveTab] = useState<Tab>("pick");
  const [roster, setRoster] = useState<Player[]>(supabaseConfigured ? [] : demoPlayers);
  const [currentUserId, setCurrentUserId] = useState(supabaseConfigured ? "" : demoPlayers[0].id);
  const [allPicks, setAllPicks] = useState<Pick[]>(supabaseConfigured ? [] : [...historicalPicks, seededCurrentPick]);
  const [weekGames, setWeekGames] = useState<Game[]>(supabaseConfigured ? [] : games);
  const [pendingGame, setPendingGame] = useState<Game | null>(null);
  const [oddsMode, setOddsMode] = useState<"demo" | "live" | "error">("demo");
  const [oddsStatus, setOddsStatus] = useState("Showing the real 2026 Week 1 NFL schedule with demo DraftKings-style lines until ODDS_API_KEY is configured.");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<"demo" | "supabase">("demo");
  const signedOutUser: Player = {
    id: "signed-out",
    displayName: authEmail?.split("@")[0] ?? "Sign In",
    avatarUrl: "SI",
    role: "player",
  };
  const currentUser = roster.find((player) => player.id === currentUserId) ?? roster[0] ?? signedOutUser;
  const isAdmin = dataMode === "demo" ? currentUser.role === "admin" : currentUser.role === "admin" && Boolean(authEmail);
  const visibleNavItems = navItems.filter((item) => item.tab !== "admin" || isAdmin);
  const activeView = activeTab === "admin" && !isAdmin ? "pick" : activeTab;
  const myCurrentPick = allPicks.find((pick) => pick.userId === currentUser.id && pick.week === currentWeek);
  const revealed = Boolean(myCurrentPick);
  const standings = useMemo(() => buildStandings(roster, allPicks), [roster, allPicks]);
  const chart = useMemo(() => buildChart(roster, allPicks, currentWeek), [roster, allPicks]);
  const showSignIn = supabaseConfigured && !authLoading && !authEmail;
  const showLeague = !supabaseConfigured || Boolean(authEmail);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const supabase = createClient();
    let mounted = true;

    async function hydrate() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;

      setAuthEmail(session?.user.email ?? null);
      if (session?.user) {
        await syncProfileAndLeague();
      } else {
        clearProductionData();
      }
      setAuthLoading(false);
    }

    hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setAuthEmail(session?.user.email ?? null);
      if (session?.user) {
        await syncProfileAndLeague();
      } else {
        clearProductionData();
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // The auth listener should be recreated only when Supabase configuration changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseConfigured]);

  async function syncProfileAndLeague() {
    setLeagueError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to update profile.");
      await loadLeagueData();
    } catch (error) {
      setLeagueError(error instanceof Error ? error.message : "Unable to update profile.");
    }
  }

  async function loadLeagueData() {
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const response = await fetch("/api/league", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to load league data.");
      setRoster(Array.isArray(payload.players) ? payload.players : []);
      setWeekGames(Array.isArray(payload.games) ? payload.games.sort(sortByKickoff) : []);
      setAllPicks(Array.isArray(payload.picks) ? payload.picks : []);
      if (payload.currentUserId) setCurrentUserId(payload.currentUserId);
      setDataMode("supabase");

      const liveOddsGames = Number(payload.oddsSummary?.liveOddsGames ?? 0);
      const totalGames = Number(payload.oddsSummary?.totalGames ?? 0);
      if (totalGames > 0 && liveOddsGames === totalGames) {
        setOddsMode("live");
        setOddsStatus(`Live DraftKings spreads loaded for all ${totalGames} games. Last update: ${payload.oddsSummary?.latestFetchedAt ?? "unknown"}.`);
      } else {
        setOddsMode("demo");
        setOddsStatus(`Waiting for live DraftKings spreads. ${liveOddsGames} of ${totalGames} games currently have live Odds API rows.`);
      }
    } catch (error) {
      setLeagueError(error instanceof Error ? error.message : "Unable to load league data.");
      setOddsMode("error");
    } finally {
      setLeagueLoading(false);
    }
  }

  function clearProductionData() {
    if (!supabaseConfigured) return;
    setRoster([]);
    setCurrentUserId("");
    setAllPicks([]);
    setWeekGames([]);
    setDataMode("supabase");
    setLeagueError(null);
    setOddsMode("demo");
    setOddsStatus("Sign in to load live league data.");
  }

  async function confirmPick(game: Game) {
    const underdog = getUnderdog(game);
    if (!underdog) return;
    if (dataMode === "supabase") {
      const response = await fetch("/api/picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          season,
          week: currentWeek,
          gameId: game.id,
          selectedTeamId: underdog.teamId,
        }),
      });
      if (response.ok) {
        await loadLeagueData();
        setPendingGame(null);
        setActiveTab("week");
      }
      return;
    }

    const nextPick: Pick = {
      id: `p-${Date.now()}`,
      userId: currentUser.id,
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
      ...existing.filter((pick) => !(pick.userId === currentUser.id && pick.week === currentWeek)),
      nextPick,
    ]);
    setPendingGame(null);
    setActiveTab("week");
  }

  async function refreshOdds() {
    setOddsStatus("Refreshing DraftKings lines...");
    try {
      const response = await fetch("/api/odds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(weekOneWindow),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Odds refresh failed");
      const fetchedGames = Array.isArray(payload.games) ? payload.games.length : 0;
      if (Array.isArray(payload.games) && payload.games.length > 0) {
        setWeekGames(payload.games.sort(sortByKickoff));
        setOddsMode("live");
      }
      await loadLeagueData();
      const persistedMessage = payload.persisted
        ? `Persisted ${payload.persisted.oddsInserted} odds rows across ${payload.persisted.gamesUpserted} games.`
        : "Odds were fetched but not persisted because Supabase service credentials are missing.";
      setOddsStatus(`Fetched ${fetchedGames} DraftKings games. ${persistedMessage} Remaining quota: ${payload.requestsRemaining ?? "unknown"}.`);
    } catch (error) {
      setOddsMode("error");
      setOddsStatus(error instanceof Error ? error.message : "Odds refresh failed. Manual entry remains available.");
    }
  }

  function addManualPlayer(displayName: string) {
    const cleanName = displayName.trim();
    if (!cleanName) return;
    const id = `manual-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    setRoster((existing) => [
      ...existing,
      {
        id,
        displayName: cleanName,
        avatarUrl: cleanName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        role: "player",
      },
    ]);
  }

  function updateGameSpread(gameId: string, side: "home" | "away", value: string) {
    const spread = Number(value);
    if (!Number.isFinite(spread)) return;
    setOddsMode("demo");
    setOddsStatus("Manual DraftKings spread override applied for testing. Refresh live odds before sending picks to friends.");
    setWeekGames((existing) =>
      existing.map((game) =>
        game.id === gameId
          ? {
              ...game,
              homeSpread: side === "home" ? spread : game.homeSpread,
              awaySpread: side === "away" ? spread : game.awaySpread,
              lastOddsUpdate: new Date().toISOString(),
            }
          : game,
      ),
    );
  }

  return (
    <div className="min-h-screen bg-[#080c12] text-white">
      <div className="fixed inset-x-0 top-0 z-20 border-b border-white/10 bg-[#080c12]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button className="flex items-center gap-3" onClick={() => setActiveTab("pick")} aria-label="Pick board">
            <div className="flex h-11 w-11 items-center justify-center rounded bg-red-600 shadow-[0_0_28px_rgba(227,24,55,0.35)]">
              <Shield className="h-6 w-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">NFL Underdog</p>
              <h1 className="text-xl font-black uppercase leading-none">Pick&apos;em</h1>
            </div>
          </button>
          <div className="hidden items-center gap-2 md:flex">
            {showLeague &&
              visibleNavItems.map((item) => (
                <NavButton key={item.tab} {...item} active={activeView === item.tab} onClick={() => setActiveTab(item.tab)} />
              ))}
          </div>
          <button
            className="flex h-11 items-center gap-2 rounded border border-white/10 bg-white/5 px-3 text-sm font-bold"
            onClick={() => setActiveTab("profile")}
          >
            <Avatar value={currentUser.avatarUrl ?? currentUser.displayName[0]} />
            <span className="hidden sm:inline">{currentUser.displayName}</span>
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 md:pb-10">
        {supabaseConfigured && authLoading && (
          <div className="mb-5 rounded border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-slate-200">
            Checking your saved sign-in...
          </div>
        )}
        {showSignIn && (
          <MagicLinkPanel loading={authLoading} />
        )}
        {supabaseConfigured && authEmail && (
          <div className="mb-5 rounded border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">
            Signed in as {authEmail}. This device will stay signed in unless you log out.
          </div>
        )}
        {leagueError && (
          <div className="mb-5 rounded border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">
            {leagueError}
          </div>
        )}
        {!supabaseConfigured && (
          <div className="mb-5 rounded border border-amber-400/25 bg-amber-400/10 p-3 text-sm font-bold text-amber-100">
            Local demo mode. Add Supabase environment variables in Vercel to enable friend magic links and shared picks.
          </div>
        )}
        {showLeague && leagueLoading && roster.length === 0 && (
          <div className="rounded border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-slate-200">
            Loading league...
          </div>
        )}
        {showLeague && (!leagueLoading || roster.length > 0 || !supabaseConfigured) && (
          <>
            {activeView === "pick" && (
              <PickScreen
                myPick={myCurrentPick}
                weekGames={weekGames}
                oddsMode={oddsMode}
                onSelect={setPendingGame}
              />
            )}
            {activeView === "week" && <WeekScreen allPicks={allPicks} roster={roster} revealed={revealed} />}
            {activeView === "standings" && <StandingsScreen standings={standings} />}
            {activeView === "history" && <HistoryScreen allPicks={allPicks} roster={roster} chart={chart} />}
            {activeView === "profile" && (
              <ProfileScreen
                roster={roster}
                currentUserId={currentUser.id}
                setCurrentUserId={setCurrentUserId}
                authEmail={authEmail}
                dataMode={dataMode}
              />
            )}
            {activeView === "admin" && (
              <AdminScreen
                oddsStatus={oddsStatus}
                oddsMode={oddsMode}
                dataMode={dataMode}
                roster={roster}
                weekGames={weekGames}
                addManualPlayer={addManualPlayer}
                refreshOdds={refreshOdds}
                updateGameSpread={updateGameSpread}
              />
            )}
          </>
        )}
      </main>

      {showLeague && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#080c12]/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-2xl gap-1" style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}>
          {visibleNavItems.map((item) => (
            <MobileNavButton key={item.tab} {...item} active={activeView === item.tab} onClick={() => setActiveTab(item.tab)} />
          ))}
        </div>
      </div>}

      {pendingGame && <ConfirmPick game={pendingGame} onBack={() => setPendingGame(null)} onConfirm={() => confirmPick(pendingGame)} />}
    </div>
  );
}

function MagicLinkPanel({ loading }: { loading: boolean }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendMagicLink() {
    setSending(true);
    setStatus(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { display_name: displayName || email.split("@")[0] },
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setStatus("Check your email. Open the magic link on this same phone or browser.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send magic link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mb-6 rounded border border-white/10 bg-white/[0.04] p-5">
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.25em] text-red-400">Join League</p>
          <h2 className="mt-2 text-3xl font-black uppercase">Sign In With Email</h2>
          <p className="mt-2 text-sm text-slate-300">
            Enter your email, tap the magic link, and you&apos;ll stay signed in on this device.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className="h-12 min-w-0 rounded border border-white/10 bg-black/30 px-4 outline-none"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
            aria-label="Display name"
            disabled={loading || sending}
          />
          <input
            className="h-12 min-w-0 rounded border border-white/10 bg-black/30 px-4 outline-none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            type="email"
            disabled={loading || sending}
          />
          <button
            className="h-12 rounded bg-red-600 px-5 font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-700"
            onClick={sendMagicLink}
            disabled={loading || sending || !email.includes("@")}
          >
            {sending ? "Sending" : "Send Link"}
          </button>
        </div>
      </div>
      {status && <p className="mt-4 rounded border border-white/10 bg-black/25 p-3 text-sm text-slate-200">{status}</p>}
    </section>
  );
}

function PickScreen({
  myPick,
  weekGames,
  oddsMode,
  onSelect,
}: {
  myPick?: Pick;
  weekGames: Game[];
  oddsMode: "demo" | "live" | "error";
  onSelect: (game: Game) => void;
}) {
  const chronologicalGames = [...weekGames].sort(sortByKickoff);

  return (
    <div className="space-y-6">
      <PageIntro eyebrow={`2026 Week ${currentWeek}`} title="Choose One Underdog" detail="All games are listed chronologically. Games lock automatically at kickoff." />
      {myPick && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          Change Pick is open until the game you already picked kicks off. Your previous spread snapshot will be discarded and the new team&apos;s current DraftKings spread will be locked when you confirm.
        </div>
      )}
      <div className={`rounded border p-4 text-sm ${oddsMode === "live" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
        <div className="flex items-start gap-3">
          {oddsMode === "live" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>
            {oddsMode === "live"
              ? "Live DraftKings spreads are loaded from The Odds API."
              : "These are not live DraftKings spreads yet. Add ODDS_API_KEY and use Admin Refresh before sending the league link."}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {chronologicalGames.map((game) => (
          <MatchupCard key={game.id} game={game} selected={myPick?.gameId === game.id} onSelect={() => onSelect(game)} />
        ))}
      </div>
    </div>
  );
}

function MatchupCard({ game, selected, onSelect }: { game: Game; selected?: boolean; onSelect: () => void }) {
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);
  const underdog = getUnderdog(game);
  const locked = hasGameStarted(game);
  const underdogTeam = underdog ? getTeam(underdog.teamId) : null;

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
        </div>
        {underdog && underdogTeam ? (
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Underdog</p>
            <p className="text-2xl font-black text-emerald-300">{underdogTeam.abbreviation} {formatSpread(underdog.spread)}</p>
          </div>
        ) : (
          <p className="text-sm font-bold text-slate-400">Odds unavailable</p>
        )}
      </div>
      <button
        disabled={!underdog || locked}
        onClick={onSelect}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded bg-red-600 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {locked ? <Lock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {locked ? "Locked" : selected ? "Change Pick" : `Pick ${underdogTeam?.abbreviation}`}
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
          The DraftKings spread is locked to {formatSpread(underdog.spread)} once submitted.
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
      <PageIntro eyebrow={`2026 Week ${currentWeek}`} title="Weekly Picks" detail="The board only shows each player and their submitted pick for this week." />
      <WeeklyPicks allPicks={allPicks} roster={roster} revealed={revealed} />
    </div>
  );
}

function StandingsScreen({ standings }: { standings: ReturnType<typeof buildStandings> }) {
  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Season" title="Standings" detail="Tie-breakers: total points, winning picks, highest single-week score." />
      <div className="overflow-hidden rounded border border-white/10">
        {standings.map((standing, index) => (
          <div key={standing.player.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-white/10 bg-white/[0.04] p-4 last:border-b-0 sm:grid-cols-[72px_1fr_repeat(3,auto)]">
            <p className="text-2xl font-black text-slate-400">{index + 1}</p>
            <div className="flex items-center gap-3">
              <Avatar value={standing.player.avatarUrl ?? standing.player.displayName[0]} />
              <div>
                <p className="font-black">{standing.player.displayName}</p>
                <p className="text-sm text-slate-400">{standing.wins}-{standing.losses} · {(standing.winPercentage * 100).toFixed(0)}%</p>
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-300">{formatPoints(standing.totalPoints)}</p>
            <StatCell label="Best" value={standing.biggestWin.toFixed(1)} />
            <StatCell label="Wins" value={String(standing.wins)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryScreen({ allPicks, roster, chart }: { allPicks: Pick[]; roster: Player[]; chart: ReturnType<typeof buildChart> }) {
  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Season" title="Results History" detail="Green wins, red losses, gray pending." />
      <SeasonChart chart={chart} roster={roster} />
      <div className="overflow-x-auto rounded border border-white/10 bg-white/[0.035]">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="p-4">Player</th>
              {[1, 2, 3, 4].map((week) => <th key={week} className="p-4">W{week}</th>)}
              <th className="p-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((player) => {
              const playerPicks = allPicks.filter((pick) => pick.userId === player.id);
              const total = playerPicks.reduce((sum, pick) => sum + pick.pointsEarned, 0);
              return (
                <tr key={player.id} className="border-t border-white/10">
                  <td className="p-4 font-black">{player.displayName}</td>
                  {[1, 2, 3, 4].map((week) => {
                    const pick = playerPicks.find((item) => item.week === week);
                    return <td key={week} className="p-4">{pick ? <PickPill pick={pick} /> : <span className="text-slate-500">Pick not submitted</span>}</td>;
                  })}
                  <td className="p-4 text-lg font-black text-emerald-300">{formatPoints(total)}</td>
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
  roster,
  currentUserId,
  setCurrentUserId,
  authEmail,
  dataMode,
}: {
  roster: Player[];
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  authEmail: string | null;
  dataMode: "demo" | "supabase";
}) {
  const currentPlayer = roster.find((player) => player.id === currentUserId) ?? roster[0];
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageIntro eyebrow="Profile" title={dataMode === "supabase" ? "Account" : "Playing As"} detail={dataMode === "supabase" ? "Your phone stays signed in after magic-link login." : "For fast testing, switch between manually managed players without logging in."} />
      <div className="rounded border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center gap-4">
          <Avatar value={currentPlayer.avatarUrl ?? currentPlayer.displayName[0]} large />
          <div>
            <p className="text-2xl font-black">{currentPlayer.displayName}</p>
            <p className="text-slate-400">
              {currentPlayer.role === "admin" ? "Admin" : "Player"}
              {authEmail ? ` · ${authEmail}` : " · no-login test mode"}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          {dataMode === "demo" && (
            <select
              className="h-12 rounded border border-white/10 bg-black/30 px-4 outline-none"
              value={currentPlayer.id}
              onChange={(event) => setCurrentUserId(event.target.value)}
              aria-label="Current player"
            >
              {roster.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          )}
          <p className="rounded border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
            {dataMode === "supabase"
              ? "Magic-link auth is active. Picks are submitted under this signed-in account."
              : "This is the quickest way to test the league with your friends' names. For real remote submissions, use Supabase Auth or secure personal pick links so one person cannot submit as someone else."}
          </p>
          {authEmail && <button className="h-12 rounded border border-white/10 font-black" onClick={signOut}>Log Out</button>}
        </div>
      </div>
    </div>
  );
}

function AdminScreen({
  oddsStatus,
  oddsMode,
  dataMode,
  roster,
  weekGames,
  addManualPlayer,
  refreshOdds,
  updateGameSpread,
}: {
  oddsStatus: string;
  oddsMode: "demo" | "live" | "error";
  dataMode: "demo" | "supabase";
  roster: Player[];
  weekGames: Game[];
  addManualPlayer: (displayName: string) => void;
  refreshOdds: () => void;
  updateGameSpread: (gameId: string, side: "home" | "away", value: string) => void;
}) {
  const [newPlayerName, setNewPlayerName] = useState("");
  function submitPlayer() {
    addManualPlayer(newPlayerName);
    setNewPlayerName("");
  }

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Admin" title="League Control Room" detail="Import DraftKings lines, edit games, enter scores, and recalculate standings." />
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Odds Source</p>
              <h3 className="mt-1 text-2xl font-black">The Odds API · DraftKings</h3>
            </div>
            <button className="flex h-11 items-center gap-2 rounded bg-emerald-400 px-4 font-black text-black" onClick={refreshOdds}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <p className="mt-4 rounded border border-white/10 bg-black/25 p-3 text-sm text-slate-300">{oddsStatus}</p>
          <p className={`mt-3 inline-flex rounded px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${oddsMode === "live" ? "bg-emerald-400 text-black" : "bg-amber-300 text-black"}`}>
            {oddsMode === "live" ? "Live DraftKings" : "Demo or manual odds"}
          </p>
          <p className="mt-4 text-sm text-slate-400">
            The live adapter requests `bookmakers=draftkings` and `markets=spreads`, then snapshots the submitted spread on pick creation.
          </p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
            {dataMode === "demo" ? "Manual Players" : "League Players"}
          </p>
          {dataMode === "demo" && (
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
          )}
          {dataMode === "supabase" && (
            <p className="mt-4 rounded border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              Production players appear here only after they sign in with a magic link.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {roster.map((player) => (
              <span key={player.id} className="rounded bg-white/10 px-3 py-2 text-sm font-bold">
                {player.displayName}
              </span>
            ))}
          </div>
        </div>
      </div>
      {dataMode === "demo" && <div className="grid gap-4">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Manual DraftKings Spread Override</p>
          <p className="mt-2 text-sm text-slate-400">
            Use this only for testing or if the API is unavailable. Refresh live odds before the league goes live.
          </p>
          <div className="mt-4 grid gap-3">
            {weekGames.map((game) => (
              <div key={game.id} className="grid gap-2 rounded border border-white/10 bg-black/20 p-3 sm:grid-cols-[1fr_100px_100px_auto] sm:items-center">
                <p className="font-bold">{getTeam(game.awayTeamId).abbreviation} @ {getTeam(game.homeTeamId).abbreviation}</p>
                <input
                  className="h-10 rounded border border-white/10 bg-black/30 px-3"
                  value={game.awaySpread ?? ""}
                  onChange={(event) => updateGameSpread(game.id, "away", event.target.value)}
                  aria-label={`${getTeam(game.awayTeamId).abbreviation} spread`}
                />
                <input
                  className="h-10 rounded border border-white/10 bg-black/30 px-3"
                  value={game.homeSpread ?? ""}
                  onChange={(event) => updateGameSpread(game.id, "home", event.target.value)}
                  aria-label={`${getTeam(game.homeTeamId).abbreviation} spread`}
                />
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{formatKickoff(game.kickoffAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}
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
                <p className="font-bold">{player.displayName}</p>
              </div>
              {revealed && pick ? <PickPill pick={pick} /> : <p className="text-sm text-slate-500">Pick not submitted</p>}
            </div>
          );
        })}
      </div>
      {!revealed && <p className="mt-4 rounded bg-amber-300/10 p-3 text-sm text-amber-100">Submit your Week {currentWeek} pick to unlock everyone else&apos;s selections.</p>}
    </section>
  );
}

function SeasonChart({ chart, roster }: { chart: ReturnType<typeof buildChart>; roster: Player[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-2xl font-black">Cumulative Points</h3>
      <div className="mt-5 h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <XAxis dataKey="week" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: "#111820", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4 }} />
            {roster.map((player, index) => (
              <Line key={player.id} type="monotone" dataKey={player.displayName} stroke={lineColors[index % lineColors.length]} strokeWidth={3} dot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
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
