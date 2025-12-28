module.exports = {
  apps: [
    {
      name: "voiceflow-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p " + (process.env.PORT || 3000),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "voiceflow-worker",
      cwd: __dirname,
      script: "worker/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};

