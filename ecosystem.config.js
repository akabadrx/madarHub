module.exports = {
  apps: [
    {
      name: "madar-membership",
      script: "./.next/standalone/server.js",
      cwd: "/var/www/madar-membership",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3201",
        HOSTNAME: "0.0.0.0",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
