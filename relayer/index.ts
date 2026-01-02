import express, { Express, Request, Response } from "express";
import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import dotenv from "dotenv";
import winston from "winston";
import rateLimit from "express-rate-limit";

dotenv.config();

// =========================================================================
// LOGGING SETUP
// =========================================================================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ filename: "relayer-error.log", level: "error" }),
        new winston.transports.File({ filename: "relayer-combined.log" })
    ]
});

// =========================================================================
// EXPRESS SETUP
// =========================================================================
const app: Express = express();
app.use(express.json());

// =========================================================================
// SECURITY: RATE LIMITING
// =========================================================================
const purgeRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 10, // 10 requests per minute per IP
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`[Security] Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: 60
        });
    }
});

const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100, // 100 requests per minute globally
    message: "Service temporarily overloaded, please try again later."
});

app.use(globalRateLimiter);

// =========================================================================
// SECURITY: REQUEST DEDUPLICATION (Idempotency)
// =========================================================================
interface IdempotencyRecord {
    timestamp: number;
    response: any;
}

const idempotencyCache = new Map<string, IdempotencyRecord>();
const IDEMPOTENCY_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up old idempotency records every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of idempotencyCache.entries()) {
        if (now - record.timestamp > IDEMPOTENCY_TTL) {
            idempotencyCache.delete(key);
        }
    }
}, 60 * 1000);

function getIdempotencyKey(userAddress: string, assets: string[], amounts: string[]): string {
    // Create a deterministic key based on request parameters
    const payload = `${userAddress}:${assets.join(",")}:${amounts.join(",")}`;
    return ethers.keccak256(ethers.toUtf8Bytes(payload));
}

// =========================================================================
// SECURITY: INPUT VALIDATION AND SANITIZATION
// =========================================================================
function validateEthereumAddress(address: string): boolean {
    return ethers.isAddress(address);
}

function validateAssetArray(assets: string[]): { valid: boolean; error?: string } {
    if (!Array.isArray(assets)) {
        return { valid: false, error: "Assets must be an array" };
    }

    if (assets.length === 0) {
        return { valid: false, error: "Assets array cannot be empty" };
    }

    if (assets.length > 20) {
        return { valid: false, error: "Too many assets (max 20)" };
    }

    // Check for duplicates
    const uniqueAssets = new Set(assets);
    if (uniqueAssets.size !== assets.length) {
        return { valid: false, error: "Duplicate assets detected" };
    }

    // Validate each asset is an address
    for (const asset of assets) {
        if (!validateEthereumAddress(asset)) {
            return { valid: false, error: `Invalid asset address: ${asset}` };
        }
    }

    return { valid: true };
}

function validateAmountArray(amounts: string[]): { valid: boolean; error?: string } {
    if (!Array.isArray(amounts)) {
        return { valid: false, error: "Amounts must be an array" };
    }

    if (amounts.length === 0) {
        return { valid: false, error: "Amounts array cannot be empty" };
    }

    for (const amount of amounts) {
        try {
            const bn = BigInt(amount);
            if (bn <= BigInt(0)) {
                return { valid: false, error: "All amounts must be positive" };
            }
            // Check for reasonable upper bound (prevent overflow attacks)
            if (bn > BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")) {
                return { valid: false, error: "Amount exceeds maximum value" };
            }
        } catch {
            return { valid: false, error: `Invalid amount: ${amount}` };
        }
    }

    return { valid: true };
}

function sanitizeSignature(signature: string): { valid: boolean; sanitized?: string; error?: string } {
    if (typeof signature !== "string") {
        return { valid: false, error: "Signature must be a string" };
    }

    // Remove whitespace
    const cleaned = signature.trim();

    // Check format (0x + 130 hex chars = 65 bytes)
    if (!/^0x[0-9a-fA-F]{130}$/.test(cleaned)) {
        return { valid: false, error: "Invalid signature format" };
    }

    return { valid: true, sanitized: cleaned };
}

// =========================================================================
// CONFIGURATION
// =========================================================================
const PORT = process.env.PORT || 3001;
const RELAYER_KEY = process.env.RELAYER_KEY;
const SWEEPER_ADDRESS = "0x6Ce61B60FF9c73e7D233221c2feFA501228c1dF2";

if (!RELAYER_KEY) {
    logger.error("RELAYER_KEY not found in environment variables");
    process.exit(1);
}

// SIMULATION VS REAL
const SIM_MODE = process.env.SIM_MODE === "true";
const HYDRA_RPC = SIM_MODE ? "ws://localhost:8002" : "wss://rpc.hydradx.cloud";
const ASSET_HUB_RPC = SIM_MODE ? "ws://localhost:8003" : "wss://westend-asset-hub-rpc.polkadot.io";
const REVIVE_RPC = SIM_MODE
    ? "http://localhost:8545" // Local Revive node
    : "https://westend-asset-hub-eth-rpc.polkadot.io";

// =========================================================================
// SWEEPER CONTRACT ABI (from compiled artifacts)
// =========================================================================
const SWEEPER_ABI = [
    "function sweepAndRepay(address user, address[] calldata assets, uint256[] calldata amounts, bytes calldata signature) external",
    "function sweepBatch(address[] calldata assets, uint256[] calldata amounts) external payable",
    "function gasTank() external view returns (uint256)",
    "function collectedFees() external view returns (uint256)",
    "function isRelayer(address) external view returns (bool)",
    "event Swept(address indexed user, uint256 assetCount, string destination)",
    "event CommissionTaken(address indexed user, uint256 amount)"
];

// =========================================================================
// ETHERS WALLET & CONTRACT SETUP
// =========================================================================
const provider = new ethers.JsonRpcProvider(REVIVE_RPC);
const wallet = new ethers.Wallet(RELAYER_KEY, provider);
const sweeperContract = new ethers.Contract(SWEEPER_ADDRESS, SWEEPER_ABI, wallet);

logger.info(`[Relayer] Wallet address: ${wallet.address}`);
logger.info(`[Relayer] Sweeper contract: ${SWEEPER_ADDRESS}`);
logger.info(`[Relayer] RPC: ${REVIVE_RPC}`);

// =========================================================================
// POLKADOT API CONNECTION CACHE
// =========================================================================
let hydraApi: ApiPromise | null = null;
let assetHubApi: ApiPromise | null = null;

// Address Mapping (Revive H160 -> AccountId32)
function evmToSubstrate(h160: string): string {
    return h160.toLowerCase() + "eeeeeeeeeeeeeeeeeeeeeeee";
}

async function getHydraApi() {
    if (!hydraApi || !hydraApi.isConnected) {
        const provider = new WsProvider(HYDRA_RPC);
        hydraApi = await ApiPromise.create({ provider });
        logger.info(`[Relayer] Connected to Hydra: ${HYDRA_RPC}`);
    }
    return hydraApi;
}

async function getAssetHubApi() {
    if (!assetHubApi || !assetHubApi.isConnected) {
        const provider = new WsProvider(ASSET_HUB_RPC);
        assetHubApi = await ApiPromise.create({ provider });
        logger.info(`[Relayer] Connected to Asset Hub: ${ASSET_HUB_RPC}`);
    }
    return assetHubApi;
}

// =========================================================================
// NONCE MANAGEMENT
// =========================================================================
let currentNonce: number | null = null;
const pendingTransactions = new Set<number>();

async function getNextNonce(): Promise<number> {
    if (currentNonce === null) {
        currentNonce = await wallet.getNonce();
        logger.info(`[Nonce] Initialized to ${currentNonce}`);
    }

    // Find next available nonce not in pending set
    while (pendingTransactions.has(currentNonce)) {
        currentNonce++;
    }

    const nonce = currentNonce;
    pendingTransactions.add(nonce);
    currentNonce++;

    logger.debug(`[Nonce] Assigned nonce ${nonce}, next will be ${currentNonce}`);
    return nonce;
}

function releaseNonce(nonce: number) {
    pendingTransactions.delete(nonce);
    logger.debug(`[Nonce] Released nonce ${nonce}`);
}

// =========================================================================
// RETRY LOGIC WITH EXPONENTIAL BACKOFF
// =========================================================================
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    operationName: string = "operation"
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            logger.debug(`[Retry] ${operationName} - Attempt ${attempt + 1}/${maxRetries}`);
            return await fn();
        } catch (error: any) {
            lastError = error;
            logger.warn(`[Retry] ${operationName} failed (attempt ${attempt + 1}/${maxRetries}): ${error.message}`);

            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                logger.debug(`[Retry] Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    logger.error(`[Retry] ${operationName} failed after ${maxRetries} attempts`);
    throw lastError;
}

// =========================================================================
// TRANSACTION QUEUE (Simple in-memory queue to prevent nonce conflicts)
// =========================================================================
interface QueuedTransaction {
    id: string;
    userAddress: string;
    assets: string[];
    amounts: string[];
    signature: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

const transactionQueue: QueuedTransaction[] = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || transactionQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    logger.info(`[Queue] Processing ${transactionQueue.length} pending transaction(s)`);

    while (transactionQueue.length > 0) {
        const tx = transactionQueue.shift()!;

        try {
            const result = await executeTransaction(
                tx.userAddress,
                tx.assets,
                tx.amounts,
                tx.signature
            );
            tx.resolve(result);
        } catch (error) {
            tx.reject(error);
        }
    }

    isProcessingQueue = false;
}

function enqueueTransaction(
    userAddress: string,
    assets: string[],
    amounts: string[],
    signature: string
): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = `${userAddress}-${Date.now()}`;
        logger.info(`[Queue] Enqueued transaction ${id}`);

        transactionQueue.push({
            id,
            userAddress,
            assets,
            amounts,
            signature,
            resolve,
            reject
        });

        // Start processing if not already running
        processQueue().catch(err => {
            logger.error(`[Queue] Processing error: ${err.message}`);
        });
    });
}

// =========================================================================
// CORE TRANSACTION EXECUTION
// =========================================================================
async function executeTransaction(
    userAddress: string,
    assets: string[],
    amounts: string[],
    signature: string
): Promise<any> {
    const nonce = await getNextNonce();

    try {
        logger.info(`[Transaction] Calling sweepAndRepay for ${userAddress} with nonce ${nonce}`);
        logger.debug(`[Transaction] Assets: ${assets.join(", ")}`);
        logger.debug(`[Transaction] Amounts: ${amounts.join(", ")}`);

        // Call sweepAndRepay with retry logic
        const tx = await retryWithBackoff(
            async () => {
                return await sweeperContract.sweepAndRepay(
                    userAddress,
                    assets,
                    amounts,
                    signature,
                    {
                        nonce,
                        gasLimit: 500000 // Conservative gas limit
                    }
                );
            },
            3, // 3 retries
            2000, // 2 second base delay
            `sweepAndRepay(${userAddress})`
        );

        logger.info(`[Transaction] Submitted: ${tx.hash}`);

        // Wait for confirmation with retry
        const receipt = await retryWithBackoff(
            async () => await tx.wait(),
            3,
            5000,
            `wait for receipt (${tx.hash})`
        );

        releaseNonce(nonce);

        if (receipt.status === 1) {
            logger.info(`[Transaction] ✓ Confirmed: ${tx.hash} (Block: ${receipt.blockNumber})`);

            // Parse events
            const commissionEvent = receipt.logs.find((log: any) => {
                try {
                    return sweeperContract.interface.parseLog(log)?.name === "CommissionTaken";
                } catch {
                    return false;
                }
            });

            let commission = "0";
            if (commissionEvent) {
                const parsed = sweeperContract.interface.parseLog(commissionEvent);
                commission = ethers.formatEther(parsed?.args[1] || 0);
            }

            return {
                status: "CONFIRMED",
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                commission: `${commission} WND`,
                timestamp: new Date().toISOString()
            };
        } else {
            throw new Error(`Transaction failed: ${tx.hash}`);
        }

    } catch (error: any) {
        releaseNonce(nonce);
        logger.error(`[Transaction] Error: ${error.message}`, { error: error.stack });
        throw error;
    }
}

// =========================================================================
// ORACLE: Omnipool Price
// =========================================================================
async function getOmnipoolPrice(assetId: string) {
    try {
        const api = await getHydraApi();
        const assetState: any = await api.query.omnipool.assets(assetId);

        if (assetState.isNone) return 0;

        const { hubReserve } = assetState.unwrap();
        logger.debug(`[Oracle] Asset ${assetId} Hub Reserve: ${hubReserve.toString()}`);
        return Number(hubReserve) / 1e12;
    } catch (e: any) {
        logger.error(`[Oracle] Error fetching price: ${e.message}`);
        return 0;
    }
}

// =========================================================================
// PRE-FLIGHT VERIFICATION
// =========================================================================
async function checkDestinationVault(userAddress: string, assets: string[]) {
    try {
        const api = await getAssetHubApi();
        const mappedAddress = evmToSubstrate(userAddress);

        for (const assetId of assets) {
            logger.debug(`[Pre-flight] Checking Asset Hub for asset ${assetId} at ${mappedAddress}...`);

            let balance: any;
            if (assetId === "0" || assetId.toLowerCase() === "dot") {
                balance = await api.query.system.account(mappedAddress);
                if (balance.data.free.isZero()) {
                    logger.warn(`[Pre-flight] DOT not found at destination.`);
                    return false;
                }
            } else {
                balance = await api.query.assets.account(assetId, mappedAddress);
                if (balance.isNone || balance.unwrap().balance.isZero()) {
                    logger.warn(`[Pre-flight] Asset ${assetId} not found at destination.`);
                    return false;
                }
            }
        }
        return true;
    } catch (e: any) {
        logger.error(`[Pre-flight] Error: ${e.message}`);
        return false;
    }
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

/**
 * POST /purge - Dispatch sponsored sweep transaction
 */
app.post("/purge", purgeRateLimiter, async (req: Request, res: Response) => {
    const { userAddress, assets, amounts, signature, chainId } = req.body;

    logger.info(`[API] POST /purge from ${userAddress || "unknown"} (IP: ${req.ip})`);

    try {
        // 1. SECURITY: Validate required fields
        if (!userAddress || !assets || !amounts || !signature) {
            logger.warn(`[Security] Missing required fields from ${req.ip}`);
            return res.status(400).json({ error: "Missing required fields: userAddress, assets, amounts, signature" });
        }

        // 2. SECURITY: Validate Ethereum address
        if (!validateEthereumAddress(userAddress)) {
            logger.warn(`[Security] Invalid user address from ${req.ip}: ${userAddress}`);
            return res.status(400).json({ error: "Invalid userAddress format" });
        }

        // 3. SECURITY: Validate assets array
        const assetsValidation = validateAssetArray(assets);
        if (!assetsValidation.valid) {
            logger.warn(`[Security] Invalid assets from ${req.ip}: ${assetsValidation.error}`);
            return res.status(400).json({ error: assetsValidation.error });
        }

        // 4. SECURITY: Validate amounts array
        const amountsValidation = validateAmountArray(amounts);
        if (!amountsValidation.valid) {
            logger.warn(`[Security] Invalid amounts from ${req.ip}: ${amountsValidation.error}`);
            return res.status(400).json({ error: amountsValidation.error });
        }

        // 5. SECURITY: Check array length match
        if (assets.length !== amounts.length) {
            logger.warn(`[Security] Array length mismatch from ${req.ip}`);
            return res.status(400).json({ error: "Assets and amounts length mismatch" });
        }

        // 6. SECURITY: Sanitize signature
        const signatureValidation = sanitizeSignature(signature);
        if (!signatureValidation.valid) {
            logger.warn(`[Security] Invalid signature format from ${req.ip}: ${signatureValidation.error}`);
            return res.status(400).json({ error: signatureValidation.error });
        }
        const sanitizedSignature = signatureValidation.sanitized!;

        // 7. SECURITY: Check for duplicate request (idempotency)
        const idempotencyKey = getIdempotencyKey(userAddress, assets, amounts);
        const cachedResponse = idempotencyCache.get(idempotencyKey);

        if (cachedResponse) {
            const age = Math.floor((Date.now() - cachedResponse.timestamp) / 1000);
            logger.info(`[Security] Duplicate request detected (age: ${age}s), returning cached response`);
            return res.json({
                ...cachedResponse.response,
                cached: true,
                age: `${age}s`
            });
        }

        // 8. Verify signature
        const message = `Authorize dotdotdust: ${userAddress} ${assets.join(",")}`;
        let recoveredAddress: string;
        try {
            recoveredAddress = ethers.verifyMessage(message, sanitizedSignature);
        } catch (error: any) {
            logger.warn(`[Security] Signature verification failed from ${req.ip}: ${error.message}`);
            return res.status(401).json({ error: "Invalid signature - verification failed" });
        }

        if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
            logger.warn(`[Security] Signature mismatch from ${req.ip}. Expected: ${userAddress}, Got: ${recoveredAddress}`);
            return res.status(401).json({ error: "Invalid signature - address mismatch" });
        }

        // 9. Pre-flight check (assets arrived at Asset Hub)
        const assetsArrived = await checkDestinationVault(userAddress, assets);
        if (!assetsArrived) {
            return res.status(400).json({ error: "Assets not detected on destination yet. Please wait for XCM to complete." });
        }

        // 10. Validate batch value (minimum 0.05 DOT equivalent)
        let totalValue = 0;
        for (const asset of assets) {
            totalValue += await getOmnipoolPrice(asset);
        }

        if (totalValue < 0.05) {
            logger.warn(`[API] Batch value too low: ${totalValue} DOT`);
            return res.status(400).json({ error: `Batch value too low: ${totalValue.toFixed(4)} DOT (minimum 0.05 DOT)` });
        }

        logger.info(`[API] Batch validated: ${assets.length} assets, ${totalValue.toFixed(4)} DOT value`);

        // 11. Enqueue transaction (prevents nonce conflicts)
        const result = await enqueueTransaction(userAddress, assets, amounts, sanitizedSignature);

        // 12. Cache successful response for idempotency
        idempotencyCache.set(idempotencyKey, {
            timestamp: Date.now(),
            response: result
        });

        res.json(result);

    } catch (error: any) {
        logger.error(`[API] /purge error: ${error.message}`, { error: error.stack });
        res.status(500).json({
            error: "Transaction failed",
            message: error.message,
            code: error.code
        });
    }
});

/**
 * GET /status - Health check and vault status
 */
app.get("/status", async (req: Request, res: Response) => {
    const MAPPED_SWEEPER = evmToSubstrate(SWEEPER_ADDRESS);

    try {
        const api = await getAssetHubApi();
        const astrBalance: any = await api.query.assets.account(1999, MAPPED_SWEEPER);
        const dotAccount: any = await api.query.system.account(MAPPED_SWEEPER);

        // Get contract state
        const gasTank = await sweeperContract.gasTank();
        const collectedFees = await sweeperContract.collectedFees();
        const isRelayer = await sweeperContract.isRelayer(wallet.address);

        res.json({
            mode: SIM_MODE ? "SIMULATION" : "PRODUCTION",
            relayer: {
                address: wallet.address,
                isAuthorized: isRelayer,
                nonce: currentNonce
            },
            sweeper: {
                address: SWEEPER_ADDRESS,
                mappedSubstrate: MAPPED_SWEEPER,
                gasTank: ethers.formatEther(gasTank),
                collectedFees: ethers.formatEther(collectedFees)
            },
            balances: {
                ASTR_1999: astrBalance.isSome ? astrBalance.unwrap().balance.toString() : "0",
                DOT_NATIVE: dotAccount.data.free.toString()
            },
            queue: {
                pending: transactionQueue.length,
                processing: isProcessingQueue
            },
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        logger.error(`[API] /status error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /health - Simple health check for uptime monitoring
 */
app.get("/health", async (req: Request, res: Response) => {
    try {
        // Check if wallet can connect
        const balance = await wallet.provider.getBalance(wallet.address);

        res.json({
            status: "healthy",
            relayerBalance: ethers.formatEther(balance),
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        logger.error(`[Health] Check failed: ${error.message}`);
        res.status(503).json({
            status: "unhealthy",
            error: error.message
        });
    }
});

// =========================================================================
// SERVER STARTUP
// =========================================================================
app.listen(PORT, () => {
    logger.info(`[dotdotdust] Relayer running on port ${PORT}`);
    logger.info(`[dotdotdust] Mode: ${SIM_MODE ? "SIMULATION" : "PRODUCTION"}`);

    // Pre-connect to speed up first request
    getHydraApi().catch(err => logger.error(`[Startup] Hydra connection failed: ${err.message}`));
    getAssetHubApi().catch(err => logger.error(`[Startup] Asset Hub connection failed: ${err.message}`));

    // Verify relayer is authorized
    sweeperContract.isRelayer(wallet.address)
        .then(isAuth => {
            if (isAuth) {
                logger.info(`[Startup] ✓ Relayer ${wallet.address} is authorized`);
            } else {
                logger.warn(`[Startup] ⚠ Relayer ${wallet.address} is NOT authorized. Contract owner must call addRelayer()`);
            }
        })
        .catch(err => logger.error(`[Startup] Could not verify relayer status: ${err.message}`));
});

// =========================================================================
// GRACEFUL SHUTDOWN
// =========================================================================
process.on("SIGINT", async () => {
    logger.info("[Shutdown] Received SIGINT, shutting down gracefully...");

    if (hydraApi) await hydraApi.disconnect();
    if (assetHubApi) await assetHubApi.disconnect();

    process.exit(0);
});
