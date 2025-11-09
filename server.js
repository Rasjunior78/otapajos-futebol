// server.js — oTaPajós Futebol (proxy para API-Football, cache e WebSocket)
// Colocar no repositório do Render (otapajos-futebol)
// Reinaldo © 2025

import express from "express";
import fs from "fs";
import path from "path";
import http from "http";
import cors from "cors";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DATA_PATH = path.join(DATA_DIR, "serieB.json");

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_SPORTS_KEY || "05723c5548f1ea50bd02a28e264bbc14"; // define no Render
const LEAGUE_ID = 73; // Série B (API-Sports league id)
const SEASON = 2025;  // temporada

const API_BASE = "https://v3.football.api-sports.io";

// fetch helper with API key header
async function fetchApi(pathSuffix) {
  const url = `${API_BASE}${pathSuffix}`;
  const res = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
  if (!res.ok) throw new Error(`API error ${res.status} ${res.statusText}`);
  return res.json();
}

// transform API-Sports responses to your frontend format
async function buildDataFromApi() {
  // get standings
  const standingsResp = await fetchApi(`/standings?league=${LEAGUE_ID}&season=${SEASON}`);
  // get fixtures (we'll fetch last/next few)
  const fixturesResp = await fetchApi(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}&last=0&next=100`);

  // extract standings array (API: response[0].league.standings[0])
  const standingsArray = (standingsResp.response?.[0]?.league?.standings?.[0]) || [];

  const standings = standingsArray.map((t) => ({
    position: t.rank,
    team: t.team?.name || t.team?.shortName || "",
    points: t.points,
    played: t.all?.played || t.matches,
    won: t.all?.win || t.win || 0,
    draw: t.all?.draw || t.draw || 0,
    lost: t.all?.lose || t.lose || 0,
    goalsFor: t.all?.goals?.for || t.goalsFor || 0,
    goalsAgainst: t.all?.goals?.against || t.goalsAgainst || 0,
  }));

  // group fixtures by round
  const fixtures = fixturesResp.response || [];
  const roundsMap = new Map();
  fixtures.forEach((f) => {
    const roundLabel = f.league?.round || `Rodada ${f.fixture?.round || "?"}`;
    const roundNumber = f.fixture?.round || null;
    const match = {
      home: f.teams?.home?.name,
      away: f.teams?.away?.name,
      homeScore: (f.goals?.home !== null && f.goals?.home !== undefined) ? f.goals.home : null,
      awayScore: (f.goals?.away !== null && f.goals?.away !== undefined) ? f.goals.away : null,
      status: f.fixture?.status?.short ? mapStatus(fixtureStatusToCommon(f.fixture?.status?.short)) : (f.fixture?.status?.long || "SCHEDULED"),
      date: f.fixture?.utcDate || f.fixture?.date || null,
      api_raw: f // keep raw if needed
    };
    const key = roundNumber || roundLabel;
    if (!roundsMap.has(key)) roundsMap.set(key, { round: key, matches: [] });
    roundsMap.get(key).matches.push(match);
  });

  // convert to array sorted by round number if numeric
  const rounds = Array.from(roundsMap.values()).sort((a,b) => {
    const na = Number(a.round), nb = Number(b.round);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.round).localeCompare(String(b.round));
  });

  const currentRound = rounds.find(r => r.matches.some(m => m.status === "LIVE" || m.status === "IN_PLAY"))?.round
    || (rounds[0] ? rounds[0].round : 1);

  return {
    competition: `Campeonato Brasileiro Série B ${SEASON}`,
    currentRound,
    rounds,
    standings
  };
}

// map API status short to simpler set
function fixtureStatusToCommon(short) {
  // API-Sports uses: NS, 1H, HT, 2H, ET, PEN, FT, AET, P, LIVE etc.
  if (!short) return "SCHEDULED";
  const s = short.toUpperCase();
  if (s === "NS") return "SCHEDULED";
  if (s === "FT" || s === "AET" || s === "P") return "FINISHED";
  if (s === "1H" || s === "2H" || s === "HT" || s === "LIVE") return "LIVE";
  return "SCHEDULED";
}

// helper in case we need different mapping
function mapStatus(s) {
  if (!s) return "SCHEDULED";
  const ss = String(s).toUpperCase();
  if (ss.includes("LIVE") || ss === "IN_PLAY") return "LIVE";
  if (ss.includes("FINAL") || ss === "FINISHED" || ss === "FT") return "FINISHED";
  return "SCHEDULED";
}

// write and broadcast
function writeDataAndBroadcast(data, wss) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  // broadcast via ws
  const payload = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(payload);
  });
  console.log("📡 Dados atualizados e broadcast enviados");
}

// ==================================================
// HTTP + WebSocket setup
// ==================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 WebSocket client conectado");
  // send current data if exists
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    ws.send(raw);
  } catch (err) {
    console.warn("⚠️ sem arquivo local ainda");
  }
});

// endpoint debug
app.get("/data", (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return res.type("application/json").send(raw);
  } catch {
    return res.status(500).json({ error: "No data" });
  }
});

// optional forced update (protected by simple secret)
app.post("/force-update", (req, res) => {
  const secret = req.headers["x-admin-secret"] || req.query.secret;
  if (!secret || secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Not allowed" });
  (async () => {
    try {
      const data = await buildDataFromApi();
      writeDataAndBroadcast(data, wss);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  })();
});

// initial update + schedule
async function initialAndSchedule() {
  if (!API_KEY) {
    console.error("❌ API_SPORTS_KEY não definida. Defina na configuração do Render.");
    return;
  }
  try {
    const data = await buildDataFromApi();
    writeDataAndBroadcast(data, wss);
  } catch (err) {
    console.error("Erro primeira coleta:", err.message);
  }
  // schedule every 2 minutes for near-real-time (be mindful of quota)
  setInterval(async () => {
    try {
      const data = await buildDataFromApi();
      writeDataAndBroadcast(data, wss);
    } catch (err) {
      console.error("Erro atualização agendada:", err.message);
    }
  }, 2 * 60 * 1000); // 2 minutos
}

initialAndSchedule();

server.listen(PORT, () => {
  console.log(`🌍 Server rodando na porta ${PORT}`);
});

