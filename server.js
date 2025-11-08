// server.js — oTaPajós Futebol 2025
// Servidor WebSocket + Endpoint de atualização
// Desenvolvido por Reinaldo Santos Jr. © 2025

import express from "express";
import fs from "fs";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const DATA_PATH = path.resolve("./data/serieB.json");
const AUTH_TOKEN = "otapajos2025"; // 🔒 senha usada no painel admin

// =========================
// 🌐 ENDPOINT DE ATUALIZAÇÃO
// =========================
app.post("/update", (req, res) => {
  const auth = req.headers.authorization;

  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    console.warn("🚫 Tentativa de acesso não autorizado");
    return res.status(403).json({ erro: "Não autorizado" });
  }

  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(req.body, null, 2));
    console.log("✅ Arquivo serieB.json atualizado via painel admin!");
    broadcastUpdate(req.body);
    res.json({ sucesso: true, mensagem: "Arquivo atualizado com sucesso" });
  } catch (err) {
    console.error("❌ Erro ao salvar:", err);
    res.status(500).json({ erro: "Falha ao salvar dados" });
  }
});

// =========================
// 🔍 ENDPOINT DE CONSULTA (para debug)
// =========================
app.get("/data", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_PATH, "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ erro: "Falha ao ler dados" });
  }
});

// =========================
// ⚙️ SERVIDOR HTTP + WEBSOCKET
// =========================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 Novo cliente conectado via WebSocket!");

  // Envia os dados atuais ao cliente
  try {
    const data = fs.readFileSync(DATA_PATH, "utf8");
    ws.send(data);
  } catch (err) {
    ws.send(JSON.stringify({ erro: "Falha ao carregar dados" }));
  }

  ws.on("close", () => console.log("🔴 Cliente desconectado"));
});

// =========================
// 📢 Função para enviar atualizações em tempo real
// =========================
function broadcastUpdate(newData) {
  const dataString = JSON.stringify(newData);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(dataString);
    }
  });
  console.log("📡 Atualização transmitida a todos os clientes conectados!");
}

// =========================
// 🚀 INICIA O SERVIDOR
// =========================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🌍 Servidor rodando na porta ${PORT}`));
