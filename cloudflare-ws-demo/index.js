export default {
  async fetch(request, env, ctx) {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      server.addEventListener("message", event => {
        server.send(`你說：${event.data}`);
      });

      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("請用 WebSocket 連線", { status: 400 });
  }
}
