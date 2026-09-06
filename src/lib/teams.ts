import type { Team } from "@/lib/types";

const logo = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

export const teams: Team[] = [
  ["ARI", "Arizona", "Cardinals", "#97233f", "#ffb612"],
  ["ATL", "Atlanta", "Falcons", "#a71930", "#000000"],
  ["BAL", "Baltimore", "Ravens", "#241773", "#9e7c0c"],
  ["BUF", "Buffalo", "Bills", "#00338d", "#c60c30"],
  ["CAR", "Carolina", "Panthers", "#0085ca", "#101820"],
  ["CHI", "Chicago", "Bears", "#0b162a", "#c83803"],
  ["CIN", "Cincinnati", "Bengals", "#fb4f14", "#000000"],
  ["CLE", "Cleveland", "Browns", "#311d00", "#ff3c00"],
  ["DAL", "Dallas", "Cowboys", "#003594", "#869397"],
  ["DEN", "Denver", "Broncos", "#fb4f14", "#002244"],
  ["DET", "Detroit", "Lions", "#0076b6", "#b0b7bc"],
  ["GB", "Green Bay", "Packers", "#203731", "#ffb612"],
  ["HOU", "Houston", "Texans", "#03202f", "#a71930"],
  ["IND", "Indianapolis", "Colts", "#002c5f", "#a2aaad"],
  ["JAX", "Jacksonville", "Jaguars", "#006778", "#d7a22a"],
  ["KC", "Kansas City", "Chiefs", "#e31837", "#ffb81c"],
  ["LV", "Las Vegas", "Raiders", "#000000", "#a5acaf"],
  ["LAC", "Los Angeles", "Chargers", "#0080c6", "#ffc20e"],
  ["LAR", "Los Angeles", "Rams", "#003594", "#ffd100"],
  ["MIA", "Miami", "Dolphins", "#008e97", "#fc4c02"],
  ["MIN", "Minnesota", "Vikings", "#4f2683", "#ffc62f"],
  ["NE", "New England", "Patriots", "#002244", "#c60c30"],
  ["NO", "New Orleans", "Saints", "#d3bc8d", "#101820"],
  ["NYG", "New York", "Giants", "#0b2265", "#a71930"],
  ["NYJ", "New York", "Jets", "#125740", "#ffffff"],
  ["PHI", "Philadelphia", "Eagles", "#004c54", "#a5acaf"],
  ["PIT", "Pittsburgh", "Steelers", "#ffb612", "#101820"],
  ["SF", "San Francisco", "49ers", "#aa0000", "#b3995d"],
  ["SEA", "Seattle", "Seahawks", "#002244", "#69be28"],
  ["TB", "Tampa Bay", "Buccaneers", "#d50a0a", "#ff7900"],
  ["TEN", "Tennessee", "Titans", "#0c2340", "#4b92db"],
  ["WAS", "Washington", "Commanders", "#5a1414", "#ffb612"],
].map(([abbreviation, city, name, primaryColor, secondaryColor]) => ({
  id: abbreviation,
  abbreviation,
  city,
  name,
  fullName: `${city} ${name}`,
  logoUrl: logo(abbreviation === "WAS" ? "wsh" : abbreviation),
  primaryColor,
  secondaryColor,
}));

export const teamById = new Map(teams.map((team) => [team.id, team]));
export const teamByName = new Map(teams.map((team) => [team.fullName.toLowerCase(), team]));

export function getTeam(id: string) {
  const team = teamById.get(id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

export function findTeamByApiName(name: string) {
  const normalized = name.toLowerCase().replace("washington commanders", "washington commanders");
  return teamByName.get(normalized);
}

