import fs from "fs";
import dotenv from "dotenv";
import { ethers } from "ethers";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

// --- ENV CONFIG ---
const RPC_URL = process.env.RPC_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const ADDRESS_FILE = process.env.ADDRESS_FILE;
const FROM_BLOCK = parseInt(process.env.FROM_BLOCK, 10);
const SCAN_DELAY_MS = parseInt(process.env.SCAN_DELAY_MS, 10) || 1000;

const provider = new ethers.JsonRpcProvider(RPC_URL);

// --- USDT ABI (only Transfer event) ---
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];
const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

// --- Load addresses to watch ---
const trackedAddresses = fs
  .readFileSync(ADDRESS_FILE, "utf-8")
  .split("\n")
  .map((a) => a.trim().toLowerCase())
  .filter((a) => a.length > 0);

// --- WebSocket Server Setup ---
const server = http.createServer();
const wss = new WebSocketServer({ server });
let subscriptions = {}; // { address: [ws1, ws2, ...] }

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get("type");
  const address = url.searchParams.get("address")?.toLowerCase();

  if (type === "subscribe" && address) {
    if (!subscriptions[address]) subscriptions[address] = [];
    subscriptions[address].push(ws);

    console.log(`✅ Client subscribed to ${address}`);
    ws.send(JSON.stringify({ message: `Subscribed to ${address}` }));
  }

  ws.on("close", () => {
    for (const addr in subscriptions) {
      subscriptions[addr] = subscriptions[addr].filter((client) => client !== ws);
    }
  });
});

server.listen(8080, () => {
  console.log(`🚀 WebSocket server running at ws://localhost:8080`);
});

// --- Tracker Logic ---
async function processTransfer(log, blockNumber) {
  try {
    const parsed = token.interface.parseLog(log);
    const { from, to, value } = parsed.args;

    const fromAddr = from.toLowerCase();
    const toAddr = to.toLowerCase();

    if (trackedAddresses.includes(fromAddr) || trackedAddresses.includes(toAddr)) {
      const amount = Number(value) / 1e6; // USDT has 6 decimals
      const txHash = log.transactionHash;
      const etherscanUrl = `https://etherscan.io/tx/${txHash}`;

      console.log(
        `📢 Block ${blockNumber}: ${amount} USDT from ${from} → ${to}\n   🔗 ${etherscanUrl}`
      );

      // 🔥 Send to subscribers
      [fromAddr, toAddr].forEach((addr) => {
        if (subscriptions[addr]) {
          subscriptions[addr].forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  block: blockNumber,
                  from,
                  to,
                  amount,
                  txHash,
                  url: etherscanUrl,
                })
              );
            }
          });
        }
      });
    }
  } catch (err) {
    console.error("❌ Error parsing log:", err);
  }
}

async function scanBlocks() {
  let currentBlock = FROM_BLOCK;
  while (true) {
    try {
      const latestBlock = await provider.getBlockNumber();
      if (currentBlock <= latestBlock) {
        const logs = await provider.getLogs({
          fromBlock: currentBlock,
          toBlock: currentBlock,
          address: TOKEN_ADDRESS,
          topics: [ethers.id("Transfer(address,address,uint256)")],
        });

        for (const log of logs) {
          await processTransfer(log, currentBlock);
        }
        currentBlock++;
      } else {
        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
      }
    } catch (err) {
      console.error("⚠️ Scan error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// --- Start ---
scanBlocks();
