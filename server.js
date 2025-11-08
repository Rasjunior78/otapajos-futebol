/*
  Servidor WebSocket — Tempo Real
  oTaPajós Futebol
*/

import WebSocket, { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

console.log(`⚡ Servidor WebSocket rodando em ws://localhost:${PORT}`);

// Função que lê o JSON local e envia para os clientes
function broadcastData() {
  const file = path.resolve('./data/serieB.json');
  if (!fs.existsSync(file)) return;
  const data = fs.readFileSync(file, 'utf8');
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Atualiza todos os clientes a cada 10 segundos
setInterval(broadcastData, 10000);

// Conexão inicial
wss.on('connection', ws => {
  console.log('Novo cliente conectado ✅');
  broadcastData();
});
