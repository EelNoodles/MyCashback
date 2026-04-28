module.exports = {
  apps: [
    {
      name: 'mycashback',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true
    }
  ],

  // pm2-logrotate config (install via: pm2 install pm2-logrotate)
  // Documented here so ops can apply identical settings:
  //   pm2 set pm2-logrotate:max_size 10M
  //   pm2 set pm2-logrotate:retain 14
  //   pm2 set pm2-logrotate:compress true
  //   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
  logrotate: {
    max_size: '10M',
    retain: 14,
    compress: true,
    rotateInterval: '0 0 * * *'
  }
};
