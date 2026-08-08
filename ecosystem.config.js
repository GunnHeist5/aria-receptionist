module.exports = {
  apps: [
    {
      name: 'aria-web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/var/www/aria',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'aria-worker',
      script: 'workers/provision-worker.js',
      cwd: '/var/www/aria',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        VOICE_PROVIDER: 'trillet',
      },
    },
    {
      name: 'aria-scraper',
      script: 'workers/auto-scraper.js',
      // FREE-TIER MODE: 1 job every 6 hours ≈ 180 leads/day ≈ ~5k Google Place
      // Details calls/month — sized to ride Google's monthly free API quota.
      // Full-tilt mode (paid, ~3k leads/day): cron '0 * * * *' + drop --batch 1.
      args: '--batch 1',
      cwd: '/var/www/aria',
      interpreter: 'node',
      interpreter_args: '--env-file=/var/www/aria/.env',
      cron_restart: '0 */6 * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'aria-sales',
      script: 'sales-manager/workers/index.js',
      cwd: '/var/www/aria',
      interpreter: 'node',
      interpreter_args: '--env-file=/var/www/aria/.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
