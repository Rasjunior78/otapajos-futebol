// oTaPajós Futebol — Série B 2025 (dados reais via API-Football)
// Desenvolvido para Reinaldo Santos Jr. | www.otapajos.com.br/futebol
// Atualiza automaticamente tabela e rodadas com dados reais da Série B

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

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_PATH = path.join(__dirname, "data", "serieB.json");
const API_KEY = "05723c5548f1ea50bd02a28e264bbc14"; // ⚠️ sua chave atual
const API_URL = "https://v3.football.api-sports.io";
const LEAGUE_ID = 73; // Série B
const SEASON = 2025;
const UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos

// ===================================================
// 🔁 Função principal — buscar dados reais
// ===================================================
async function atualizarDados() {
  try {
    console.log("⏳ Atualizando dados da Série B 2025...");

    const headers = { "x-apisports-key": API_KEY };

    const [standingsRes, fixturesRes] = await Promise.all([
      fetch(`${API_URL}/standings?league=${LEAGUE_ID}&season=${SEASON}`, { headers }),
      fetch(`${API_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`, { headers }),
    ]);

    if (!standingsRes.ok || !fixturesRes.ok)
      throw new Error("Falha ao acessar API-Football");

    const standingsData = await standingsRes.json();
    const fixturesData = await fixturesRes.json();

    const standingsList =
      standingsData.response?.[0]?.league?.standings?.[0] || [];

    const standings = standingsList.map((team) => ({
      position: team.rank,
      team: team.team.name,
      points: team.points,
      played: team.all.played,
      won: team.all.win,
      draw: team.all.draw,
      lost: team.all.lose,
      goalsFor: team.all.goals.for,
      goalsAgainst: team.all.goals.against,
    }));

    const fixtures = fixturesData.response || [];
    const roundsMap = {};

    fixtures.forEach((f) => {
      const round = f.league.round || "Desconhecida";
      if (!roundsMap[round]) roundsMap[round] = [];
      roundsMap[round].push({
        home: f.teams.home.name,
        away: f.teams.away.name,
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        status: mapStatus(f.fixture.status.short),
        date: f.fixture.date,
      });
    });

    const rounds = Object.keys(roundsMap).map((r) => ({
      round: r,
      matches: roundsMap[r],
    }));

    const rodadaAtual =
      rounds.find((r) =>
        r.matches.some((m) => m.status === "LIVE" || m.status === "IN_PLAY")
      )?.round || rounds[0]?.round;

    const data = {
      competition: "Campeonato Brasileiro Série B 2025",
      currentRound: rodadaAtual,
      standings,
      rounds,
      updated: new Date().toISOString(),
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log("✅ Dados atualizados e salvos.");

    broadcastUpdate(data);
  } catch (err) {
    console.error("❌ Erro ao atualizar dados:", err.message);
  }
}

// ===================================================
// 🛰️ Enviar atualização a todos os navegadores
// ===================================================
function broadcastUpdate(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(json);
  });
  console.log("📡 Atualização enviada a todos os clientes.");
}

// ===================================================
// 🕹️ Mapeia status da API para legível
// ===================================================
function mapStatus(status) {
  if (!status) return "SCHEDULED";
  const s = status.toUpperCase();
  if (["NS", "TBD"].includes(s)) return "SCHEDULED";
  if (["1H", "2H", "LIVE"].includes(s)) return "LIVE";
  if (["FT", "AET", "PEN"].includes(s)) return "FINISHED";
  return "SCHEDULED";
}

// ===================================================
// 🌍 Endpoints
// ===================================================
app.get("/data", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_PATH, "utf8");
    res.type("application/json").send(data);
  } catch {
    res.status(500).json({ error: "Sem dados locais" });
  }
});

// ===================================================
// ⏰ Atualização automática
// ===================================================
setInterval(atualizarDados, UPDATE_INTERVAL);
atualizarDados();

// ===================================================
// 🚀 Inicialização
// ===================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🌍 Servidor oTaPajós Futebol rodando na porta ${PORT}`)
);
