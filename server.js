// oTaPajós Futebol — Dados Reais Série B 2025
// Desenvolvido para Reinaldo Santos Jr.
// Fonte oficial: API Futebol (https://api.api-futebol.com.br)

import express from "express";
import fs from "fs";
import http from "http";
import cors from "cors";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_PATH = path.join(__dirname, "data", "serieB.json");
const API_URL = "https://api.api-futebol.com.br/v1/campeonatos/11";
const TOKEN = "SEU_TOKEN_AQUI"; // 🔒 Cole aqui o token do painel API Futebol

// =======================================================
// 🔄 Função para buscar dados reais da Série B 2025
// =======================================================
async function atualizarDados() {
  try {
    console.log("⏳ Atualizando dados da Série B 2025...");

    const [tabelaRes, rodadasRes] = await Promise.all([
      fetch(`${API_URL}/tabela`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      fetch(`${API_URL}/rodadas`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
    ]);

    if (!tabelaRes.ok || !rodadasRes.ok) throw new Error("Falha nas requisições");

    const tabela = await tabelaRes.json();
    const rodadas = await rodadasRes.json();

    const rodadaAtual = rodadas.find((r) => r.status === "andamento")?.rodada || rodadas.length;

    const data = {
      competition: "Campeonato Brasileiro Série B 2025",
      currentRound: rodadaAtual,
      rounds: rodadas.map((r) => ({
        round: r.rodada,
        matches: r.partidas.map((p) => ({
          home: p.time_mandante.nome_popular,
          away: p.time_visitante.nome_popular,
          homeScore: p.placar_mandante,
          awayScore: p.placar_visitante,
          status: p.status,
          date: p.data_realizacao_iso,
        })),
      })),
      standings: tabela.map((t, i) => ({
        position: i + 1,
        team: t.time.nome_popular,
        points: t.pontos,
        played: t.jogos,
        won: t.vitorias,
        draw: t.empates,
        lost: t.derrotas,
        goalsFor: t.gols_pro,
        goalsAgainst: t.gols_contra,
      })),
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log("✅ Dados reais atualizados com sucesso!");

    broadcastUpdate(data);
  } catch (err) {
    console.error("❌ Erro ao atualizar dados:", err.message);
  }
}

// =======================================================
// 📡 WebSocket — envia atualização a todos os clientes
// =======================================================
function broadcastUpdate(newData) {
  const dataString = JSON.stringify(newData);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(dataString);
  });
  console.log("📢 Atualização enviada a todos os navegadores conectados!");
}

// =======================================================
// 🌍 Endpoint de verificação
// =======================================================
app.get("/data", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_PATH, "utf8");
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ erro: "Falha ao ler arquivo local" });
  }
});

// =======================================================
// ⏰ Atualiza automaticamente a cada 10 minutos
// =======================================================
setInterval(atualizarDados, 10 * 60 * 1000); // 10 min
atualizarDados(); // primeira atualização imediata

// =======================================================
// 🚀 Inicialização do servidor
// =======================================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🌍 Servidor oTaPajós Futebol rodando na porta ${PORT}`)
);
