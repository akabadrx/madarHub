module.exports = {
  apps: [
    {
      name: "madar-crm",
      script: "./.next/standalone/server.js",
      cwd: "/var/www/madar-crm",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3200",
        HOSTNAME: "0.0.0.0",
      },
      // Set your actual domain here if needed, e.g.:
      // env_production: {
      //   NODE_ENV: "production",
      //   PORT: "3000",
      // },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
