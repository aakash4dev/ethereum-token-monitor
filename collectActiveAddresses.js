import fs from "fs";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

// --- ENV CONFIG ---
const RPC_URL = process.env.RPC_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS; // e.g. USDT contract
const START_BLOCK = 23173700;
const MAX_ADDRESSES = 10000;
const SCAN_DELAY_MS = 500; // pause between scans

const provider = new ethers.JsonRpcProvider(RPC_URL);

// --- ERC20 ABI (only Transfer event) ---
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];
const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

const collected = new Set();

async function saveAddresses() {
  fs.writeFileSync("addresses.txt", Array.from(collected).join("\n"), "utf-8");
  console.log(`💾 Saved ${collected.size} addresses to addresses.txt`);
}

async function collectAddresses() {
  let currentBlock = START_BLOCK;

  while (collected.size < MAX_ADDRESSES) {
    try {
      const latestBlock = await provider.getBlockNumber();

      if (currentBlock <= latestBlock) {
        console.log(`🔎 Scanning block ${currentBlock}... Collected: ${collected.size}`);

        const logs = await provider.getLogs({
          fromBlock: currentBlock,
          toBlock: currentBlock,
          address: TOKEN_ADDRESS,
          topics: [ethers.id("Transfer(address,address,uint256)")],
        });

        for (const log of logs) {
          try {
            const parsed = token.interface.parseLog(log);
            const { from, to } = parsed.args;

            collected.add(from.toLowerCase());
            collected.add(to.toLowerCase());

            if (collected.size >= MAX_ADDRESSES) {
              await saveAddresses();
              console.log("✅ Done! Reached 10,000 unique addresses.");
              return;
            }
          } catch (err) {
            console.error("❌ Parse error:", err);
          }
        }
        currentBlock++;
      } else {
        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS));
      }
    } catch (err) {
      console.error("⚠️ Error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

collectAddresses();
