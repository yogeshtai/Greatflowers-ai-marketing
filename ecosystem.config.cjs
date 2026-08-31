module.exports = {
  apps: [
    {
      name: 'greatflowers-marketing-api',
      script: './node_modules/.bin/tsx',
      args: 'src/server.ts',
      cwd: '/var/www/Greatflowers-ai-marketing',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      error_file: '/var/www/Greatflowers-ai-marketing/logs/error.log',
      out_file: '/var/www/Greatflowers-ai-marketing/logs/out.log',
      log_file: '/var/www/Greatflowers-ai-marketing/logs/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
