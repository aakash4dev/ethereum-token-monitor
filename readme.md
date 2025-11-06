# Ethereum Token Monitor

Real-time ERC-20 token transfer monitoring with WebSocket streaming.

## Quick Start

1. **Setup**
```sh
cp .sample.env .env
npm i
```

2. **Configure `.env`**
```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
TOKEN_ADDRESS=0xdac17f958d2ee523a2206206994597c13d831ec7
ADDRESS_FILE=./addresses.txt
FROM_BLOCK=23173700
```

3. **Collect addresses** (optional)
```sh
node collectActiveAddresses.js
```

4. **Start monitoring**
```sh
npm start
```

WebSocket server: `ws://localhost:8080`

## WebSocket API

**Subscribe to address:**
```
ws://localhost:8080?type=subscribe&address=0xYourAddress
```

**Event payload:**
```json
{
  "block": 12345678,
  "from": "0xSender",
  "to": "0xReceiver",
  "amount": 12.345678,
  "txHash": "0xHash",
  "url": "https://etherscan.io/tx/0xHash"
}
```

**Client example:**
```js
import WebSocket from "ws";

const ws = new WebSocket(
  `ws://localhost:8080?type=subscribe&address=0xYourAddress`
);

ws.on("message", (data) => console.log(JSON.parse(data)));
```

## How It Works

- Scans Ethereum blocks for `Transfer` events
- Filters events involving addresses in `addresses.txt`
- Streams matching transfers to subscribed WebSocket clients
- Monitors both incoming and outgoing transfers

## Notes

- Assumes 6 decimals (USDT). Adjust for other tokens in `index.js`
- `addresses.txt`: one lowercase address per line
- Requires RPC with adequate rate limits

## License

MIT