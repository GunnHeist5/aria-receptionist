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
  ],
};
