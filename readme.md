### Ethereum Token Monitor

Monitor Ethereum ERC-20 `Transfer` events for a set of tracked addresses and stream matched events over WebSocket.

### Features
- **Address collector**: Scans blocks and collects unique token holder addresses into `addresses.txt`.
- **Live monitor**: Watches blocks for `Transfer` events of a target token and emits only those involving tracked addresses.
- **WebSocket server**: Clients can subscribe to specific addresses and receive real-time notifications.

### Requirements
- Node.js >= 16

### Setup
1. Copy env template and configure:
```sh
cp .sample.env .env
```
2. Edit `.env` and set values:
```env
RPC_URL=...            # Ethereum RPC endpoint
TOKEN_ADDRESS=...      # ERC-20 contract (e.g., USDT on mainnet)
ADDRESS_FILE=./addresses.txt
FROM_BLOCK=23173700    # Start block for monitoring
SCAN_DELAY_MS=50       # Optional: polling delay when caught up
```

3. Install dependencies:
```sh
npm i
```

### Usage
- Collect active addresses (writes to `addresses.txt`):
```sh
node collectActiveAddresses.js
```

- Start the monitor and WebSocket server:
```sh
npm start
# or
node index.js
```

By default the WebSocket server listens on `ws://localhost:8080`.

### WebSocket API
- Subscribe to updates for a specific address (checks both sender and receiver):
```
ws://localhost:8080?type=subscribe&address=0xYourAddress
```

- Sample JSON message broadcast on matching transfer:
```json
{
  "block": 12345678,
  "from": "0x...",
  "to": "0x...",
  "amount": 12.345678,
  "txHash": "0x...",
  "url": "https://etherscan.io/tx/0x..."
}
```

### Quick client example (Node.js)
```js
import WebSocket from "ws";

const address = "0xYourAddress".toLowerCase();
const ws = new WebSocket(`ws://localhost:8080?type=subscribe&address=${address}`);

ws.on("open", () => console.log("connected"));
ws.on("message", (data) => console.log("event:", data.toString()));
ws.on("close", () => console.log("closed"));
```

### Notes
- The monitor uses the ERC-20 `Transfer(address,address,uint256)` event topic filter.
- Amount is decoded assuming 6 decimals (USDT). For other tokens, adjust the decimal handling in `index.js` accordingly.
- `addresses.txt` should contain one address per line (lowercased). You can generate it using the collector or maintain it manually.
- Ensure your `RPC_URL` has sufficient rate limits for continuous scanning.

### Scripts
- `npm start`: Run `index.js` (monitor + WebSocket server)
- `npm run dev`: Run with `nodemon`

### License
MIT
