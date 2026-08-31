module.exports = {
  apps: [
    {
      name: 'greatflowers-marketing-admin',
      script: 'npx',
      args: 'vite preview --port 3006 --host',
      cwd: '/var/www/Greatflowers-ai-marketing/client',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3006
      },
      error_file: '/var/www/Greatflowers-ai-marketing/client/logs/error.log',
      out_file: '/var/www/Greatflowers-ai-marketing/client/logs/out.log',
      log_file: '/var/www/Greatflowers-ai-marketing/client/logs/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
