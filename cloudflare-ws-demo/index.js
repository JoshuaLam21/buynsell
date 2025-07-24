// index.js ── Cloudflare Worker
// 一律傳遞 JSON，依 action 區分邏輯。
// 此為「單大廳」示範：所有玩家共用一個狀態。
// 需求更進階可改用 Durable Objects。

// 大廳狀態存在全域（每個節點獨立）。小流量即可；高流量請改 Durable Objects。
const lobby = {
  clients: new Set(),
  currentPrice: 100,
  priceHistory: [100],
  marketSentiment: { bullish: 0, bearish: 0 }
};

// 便利函式
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  lobby.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// 產生排行榜（僅示意，實際可依需求擴充）
const leaderboard = () => [];

export default {
  async fetch(request, env) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket only", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    lobby.clients.add(server);

    server.addEventListener("message", event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      switch (data.action) {
        case "join_game": {
          // 回傳初始化資料
          server.send(JSON.stringify({
            action: "game_init",
            currentPrice: lobby.currentPrice,
            priceHistory: lobby.priceHistory,
            onlineCount: lobby.clients.size,
            location: "unknown",
            leaderboard: leaderboard(),
            regionRanking: [],
            marketSentiment: lobby.marketSentiment
          }));
          // 全體在線人數更新
          broadcast({ action: "online_count_update", count: lobby.clients.size });
          break;
        }
        case "trade_request": {
          const delta = data.tradeType === "buy" ? 1 : -1;
          lobby.currentPrice = Math.max(1, lobby.currentPrice + delta);
          lobby.priceHistory.push(lobby.currentPrice);
          if (lobby.priceHistory.length > 100) lobby.priceHistory.shift();

          broadcast({
            action: "price_update",
            currentPrice: lobby.currentPrice,
            priceHistory: lobby.priceHistory,
            priceChange: delta,
            lastTrade: {
              username: data.username,
              type: data.tradeType,
              volume: 1,
              price: lobby.currentPrice - delta,
              newPrice: lobby.currentPrice,
              timestamp: Date.now()
            }
          });
          break;
        }
        case "sentiment_update": {
          if (data.sentiment === "bull") lobby.marketSentiment.bullish++;
          if (data.sentiment === "bear") lobby.marketSentiment.bearish++;
          broadcast({ action: "sentiment_update", sentiment: lobby.marketSentiment });
          break;
        }
      }
    });

    server.addEventListener("close", () => {
      lobby.clients.delete(server);
      broadcast({ action: "online_count_update", count: lobby.clients.size });
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
