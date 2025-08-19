const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');

class TokenTransferMonitor {
    constructor(config) {
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.monitoredAddresses = new Set();
        this.tokenContract = null;
        this.isRunning = false;
        this.lastProcessedBlock = 0;
        
        // ERC-20 Transfer event signature
        this.transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        this.initializeContract();
    }

    initializeContract() {
        // ERC-20 ABI (only Transfer event)
        const erc20ABI = [
            "event Transfer(address indexed from, address indexed to, uint256 value)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)",
            "function name() view returns (string)"
        ];
        
        this.tokenContract = new ethers.Contract(
            this.config.tokenAddress,
            erc20ABI,
            this.provider
        );
    }

    async loadAddresses(addressFilePath) {
        try {
            const data = await fs.readFile(addressFilePath, 'utf8');
            const addresses = data.split('\n')
                .map(addr => addr.trim().toLowerCase())
                .filter(addr => addr && ethers.isAddress(addr));
            
            addresses.forEach(addr => this.monitoredAddresses.add(addr));
            
            console.log(`✅ Loaded ${addresses.length} addresses for monitoring`);
            return addresses.length;
        } catch (error) {
            console.error('❌ Error loading addresses:', error.message);
            throw error;
        }
    }

    async getTokenInfo() {
        try {
            const [name, symbol, decimals] = await Promise.all([
                this.tokenContract.name(),
                this.tokenContract.symbol(),
                this.tokenContract.decimals()
            ]);
            
            return { name, symbol, decimals: Number(decimals) };
        } catch (error) {
            console.error('❌ Error getting token info:', error.message);
            return { name: 'Unknown', symbol: 'UNK', decimals: 18 };
        }
    }

    formatTokenAmount(amount, decimals) {
        return ethers.formatUnits(amount, decimals);
    }

    async processTransferEvent(log, tokenInfo) {
        try {
            // Decode the Transfer event
            const decoded = this.tokenContract.interface.parseLog({
                topics: log.topics,
                data: log.data
            });

            const fromAddress = decoded.args.from.toLowerCase();
            const toAddress = decoded.args.to.toLowerCase();
            const amount = decoded.args.value;

            // Check if any of our monitored addresses are involved
            const isFromMonitored = this.monitoredAddresses.has(fromAddress);
            const isToMonitored = this.monitoredAddresses.has(toAddress);

            if (isFromMonitored || isToMonitored) {
                // Get transaction details
                const tx = await this.provider.getTransaction(log.transactionHash);
                const block = await this.provider.getBlock(log.blockNumber);
                
                const transferDetails = {
                    transactionHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                    fromAddress: decoded.args.from,
                    toAddress: decoded.args.to,
                    amount: this.formatTokenAmount(amount, tokenInfo.decimals),
                    rawAmount: amount.toString(),
                    tokenSymbol: tokenInfo.symbol,
                    tokenName: tokenInfo.name,
                    timestamp: new Date(block.timestamp * 1000).toISOString(),
                    gasUsed: tx?.gasLimit?.toString() || 'N/A',
                    gasPrice: tx?.gasPrice?.toString() || 'N/A',
                    isFromMonitored,
                    isToMonitored,
                    transferType: isFromMonitored && isToMonitored ? 'internal' : 
                                 isFromMonitored ? 'outgoing' : 'incoming'
                };

                await this.notifyTransfer(transferDetails);
                return transferDetails;
            }
        } catch (error) {
            console.error('❌ Error processing transfer event:', error.message);
        }
        return null;
    }

    async notifyTransfer(transferDetails) {
        // Console notification
        console.log('\n🔔 TOKEN TRANSFER DETECTED!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📄 Transaction Hash: ${transferDetails.transactionHash}`);
        console.log(`🏦 From: ${transferDetails.fromAddress}`);
        console.log(`🏦 To: ${transferDetails.toAddress}`);
        console.log(`💰 Amount: ${transferDetails.amount} ${transferDetails.tokenSymbol}`);
        console.log(`📅 Timestamp: ${transferDetails.timestamp}`);
        console.log(`🔄 Transfer Type: ${transferDetails.transferType.toUpperCase()}`);
        console.log(`📊 Block Number: ${transferDetails.blockNumber}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Log to file
        await this.logToFile(transferDetails);

        // // Optional: Send to webhook/API
        // if (this.config.webhookUrl) {
        //     await this.sendWebhookNotification(transferDetails);
        // }

        // // Optional: Send email notification
        // if (this.config.emailConfig) {
        //     await this.sendEmailNotification(transferDetails);
        // }
    }

    async logToFile(transferDetails) {
        try {
            const logDir = path.join(__dirname, 'logs');
            await fs.mkdir(logDir, { recursive: true });
            
            const logFile = path.join(logDir, `transfers_${new Date().toISOString().split('T')[0]}.json`);
            const logEntry = JSON.stringify(transferDetails, null, 2) + ',\n';
            
            await fs.appendFile(logFile, logEntry);
        } catch (error) {
            console.error('❌ Error logging to file:', error.message);
        }
    }

    async sendWebhookNotification(transferDetails) {
        try {
            const response = await fetch(this.config.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'token_transfer',
                    data: transferDetails
                })
            });

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }

            console.log('✅ Webhook notification sent successfully');
        } catch (error) {
            console.error('❌ Error sending webhook notification:', error.message);
        }
    }

    async sendEmailNotification(transferDetails) {
        // Placeholder for email notification
        // You can integrate with services like SendGrid, Nodemailer, etc.
        console.log('📧 Email notification would be sent here');
    }

    async scanHistoricalBlocks(fromBlock, toBlock, tokenInfo) {
        console.log(`🔍 Scanning historical blocks from ${fromBlock} to ${toBlock}...`);
        
        try {
            const filter = {
                address: this.config.tokenAddress,
                topics: [this.transferEventSignature],
                fromBlock,
                toBlock
            };

            const logs = await this.provider.getLogs(filter);
            console.log(`📋 Found ${logs.length} transfer events to process`);

            let processedCount = 0;
            for (const log of logs) {
                const result = await this.processTransferEvent(log, tokenInfo);
                if (result) {
                    processedCount++;
                }
            }

            console.log(`✅ Processed ${processedCount} relevant transfers`);
        } catch (error) {
            console.error('❌ Error scanning historical blocks:', error.message);
        }
    }

    async startRealTimeMonitoring(tokenInfo) {
        console.log('🚀 Starting real-time monitoring...');
        
        // Set up event listener for new Transfer events
        const filter = this.tokenContract.filters.Transfer();
        
        this.tokenContract.on(filter, async (from, to, value, event) => {
            console.log(`📡 New transfer detected in block ${event.blockNumber}`);
            
            const log = {
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber,
                topics: event.topics,
                data: event.data
            };

            await this.processTransferEvent(log, tokenInfo);
        });

        console.log('✅ Real-time monitoring active');
    }

    async start() {
        try {
            console.log('🔧 Initializing Token Transfer Monitor...');
            
            // Load addresses
            if (this.config.addressFile) {
                await this.loadAddresses(this.config.addressFile);
            } else if (this.config.addresses) {
                this.config.addresses.forEach(addr => 
                    this.monitoredAddresses.add(addr.toLowerCase())
                );
                console.log(`✅ Loaded ${this.config.addresses.length} addresses for monitoring`);
            }

            if (this.monitoredAddresses.size === 0) {
                throw new Error('No addresses to monitor!');
            }

            // Get token info
            const tokenInfo = await this.getTokenInfo();
            console.log(`📊 Monitoring token: ${tokenInfo.name} (${tokenInfo.symbol})`);
            console.log(`📍 Token Address: ${this.config.tokenAddress}`);
            console.log(`👥 Monitoring ${this.monitoredAddresses.size} addresses`);

            // Get current block number
            const currentBlock = await this.provider.getBlockNumber();
            console.log(`📦 Current block: ${currentBlock}`);

            // Scan historical blocks if specified
            if (this.config.scanHistorical && this.config.fromBlock) {
                await this.scanHistoricalBlocks(
                    this.config.fromBlock, 
                    currentBlock, 
                    tokenInfo
                );
            }

            // Start real-time monitoring
            await this.startRealTimeMonitoring(tokenInfo);
            this.isRunning = true;

            console.log('🎯 Monitor is now active and watching for transfers!');

        } catch (error) {
            console.error('❌ Failed to start monitor:', error.message);
            throw error;
        }
    }

    async stop() {
        console.log('🛑 Stopping monitor...');
        this.isRunning = false;
        this.tokenContract.removeAllListeners();
        console.log('✅ Monitor stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            monitoredAddresses: this.monitoredAddresses.size,
            tokenAddress: this.config.tokenAddress,
            rpcUrl: this.config.rpcUrl
        };
    }
}

// Configuration
const config = {
    // RPC URL - Replace with your preferred RPC provider
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com',
    
    // Token contract address to monitor
    tokenAddress: process.env.TOKEN_ADDRESS || '0xA0b86a33E6411a3C4BE4E0F7C2d2C3EDB6b2DCf8', // Replace with actual token
    
    // File containing addresses (one per line) or direct array
    addressFile: process.env.ADDRESS_FILE || './addresses.txt',
    // addresses: ['0x...', '0x...'], // Alternative to file
    
    // Historical scanning (optional)
    scanHistorical: process.env.SCAN_HISTORICAL === 'true' || false,
    fromBlock: process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : null,
    
    // Notification endpoints (optional)
    webhookUrl: process.env.WEBHOOK_URL || null,
    emailConfig: process.env.EMAIL_CONFIG ? JSON.parse(process.env.EMAIL_CONFIG) : null
};

// Main execution
async function main() {
    const monitor = new TokenTransferMonitor(config);

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🔄 Graceful shutdown initiated...');
        await monitor.stop();
        process.exit(0);
    });

    try {
        await monitor.start();
        
        // Keep the process alive
        setInterval(() => {
            const status = monitor.getStatus();
            console.log(`💓 Monitor Status: ${status.isRunning ? 'ACTIVE' : 'INACTIVE'} | Watching ${status.monitoredAddresses} addresses`);
        }, 60000); // Status update every minute

    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = { TokenTransferMonitor };

// Run if called directly
if (require.main === module) {
    main();
}