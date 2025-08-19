// client.js
import WebSocket from "ws";

const address = "0xbCA547E92Be7aA96EC0a312B4d582BCD4756ecaa".toLowerCase();
const ws = new WebSocket(`ws://localhost:8080?type=subscribe&address=${address}`);

ws.on("open", () => {
  console.log("🔌 Connected to WebSocket server");
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  console.log("📩 Received:", msg);
});

ws.on("close", () => {
  console.log("❌ Disconnected from server");
});

ws.on("error", (err) => {
  console.error("⚠️ WebSocket error:", err);
});
