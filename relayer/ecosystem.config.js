module.exports = {
  apps: [
    {
      name: "dotdotdust-relayer",
      script: "dist/index.js",
      instances: 1, // Single instance to avoid nonce conflicts
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        LOG_LEVEL: "info"
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3001,
        LOG_LEVEL: "debug",
        SIM_MODE: "true"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        LOG_LEVEL: "info",
        SIM_MODE: "false"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 5000,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
    }
  ],

  deploy: {
    production: {
      user: "deploy",
      host: ["your-vps-ip"],
      ref: "origin/main",
      repo: "git@github.com:yourusername/dotdotdust.git",
      path: "/var/www/dotdotdust-relayer",
      "post-deploy": "cd relayer && npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      env: {
        NODE_ENV: "production"
      }
    }
  }
};
