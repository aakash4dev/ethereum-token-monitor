import { ethers } from "ethers";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const FROM_BLOCK = parseInt(process.env.FROM_BLOCK);
const SCAN_DELAY_MS = parseInt(process.env.SCAN_DELAY_MS || "50");
const ADDRESS_FILE = process.env.ADDRESS_FILE;

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Load tracked addresses
const trackedAddresses = fs
  .readFileSync(ADDRESS_FILE, "utf8")
  .split("\n")
  .map((a) => a.trim().toLowerCase())
  .filter((a) => a);

console.log("Tracked addresses:", trackedAddresses);

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const usdt = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function scanPastTransfers() {
  const latestBlock = await provider.getBlockNumber();
  console.log(`🔍 Scanning past USDT transfers from block ${FROM_BLOCK} → ${latestBlock} ...`);

  const step = 100; // <= adjust for your RPC limit, hwo many blocks at a time
  for (let start = FROM_BLOCK; start <= latestBlock; start += step + 1) {
    const end = Math.min(start + step, latestBlock);

    try {
      const logs = await provider.getLogs({
        address: TOKEN_ADDRESS,
        fromBlock: start,
        toBlock: end,
        topics: [ethers.id("Transfer(address,address,uint256)")],
      });

      for (const log of logs) {
        const parsed = usdt.interface.parseLog(log);
        const { from, to, value } = parsed.args;
      
        if (
          trackedAddresses.includes(from.toLowerCase()) ||
          trackedAddresses.includes(to.toLowerCase())
        ) {
          const txHash = log.transactionHash;
          const etherscanUrl = `https://etherscan.io/tx/${txHash}`;
      
          // USDT has 6 decimals
          const amount = Number(value) / 1e6;
      
          console.log(
            `📦 Block ${log.blockNumber}: ${amount} USDT from ${from} → ${to}\n   🔗 ${etherscanUrl}`
          );
        }
      }
      
      
    } catch (err) {
      console.error(`❌ Error fetching logs ${start} → ${end}:`, err.message);
      await sleep(1000);
    }

    await sleep(SCAN_DELAY_MS);
  }
}

async function watchNewBlocks() {
  console.log("👀 Watching new blocks for USDT transfers...");
  provider.on("block", async (blockNumber) => {
    try {
      const logs = await provider.getLogs({
        address: TOKEN_ADDRESS,
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [ethers.id("Transfer(address,address,uint256)")],
      });

      for (const log of logs) {
        const parsed = usdt.interface.parseLog(log);
        const { from, to, value } = parsed.args;
      
        if (
          trackedAddresses.includes(from.toLowerCase()) ||
          trackedAddresses.includes(to.toLowerCase())
        ) {
          const txHash = log.transactionHash;
          const etherscanUrl = `https://etherscan.io/tx/${txHash}`;
      
          const amount = Number(value) / 1e6; // convert to readable format
      
          console.log(
            `📢 New Block ${blockNumber}: ${amount} USDT from ${from} → ${to}\n   🔗 ${etherscanUrl}`
          );
        }
      }
      
      
    } catch (err) {
      console.error(`❌ Error fetching logs for block ${blockNumber}:`, err.message);
    }
  });
}

(async () => {
  await scanPastTransfers();
  await watchNewBlocks();
})();
