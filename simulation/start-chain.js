const { setupWithServer } = require("@acala-network/chopsticks");
const fs = require("fs");
const path = require("path");

async function main() {
    const configPath = process.argv[2];
    if (!configPath) {
        console.error("Usage: node start-chain.js <config.json>");
        process.exit(1);
    }

    // Load and parse the config
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Set environment flag to skip the buggy plugin loader
    process.env.DISABLE_PLUGINS = 'true';

    console.log(`🚀 Starting simulation with config: ${configPath}`);
    console.log(`   Endpoint: ${config.endpoint}`);
    console.log(`   Port:     ${config.port}`);

    try {
        const context = await setupWithServer(config);
        console.log(`✅ Chain is live! WS: ws://localhost:${config.port}`);
        
        // Keep the process alive
        process.on('SIGINT', async () => {
            console.log('\nStopping chain...');
            await context.close();
            process.exit(0);
        });
    } catch (e) {
        console.error("❌ Failed to start chain:", e);
        process.exit(1);
    }
}

main();
