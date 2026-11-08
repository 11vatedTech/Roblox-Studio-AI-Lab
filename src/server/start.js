import { createLabServer } from './app.js';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.LAB_PORT ?? '4177', 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('LAB_PORT must be an integer from 1024 to 65535.');
}

const server = createLabServer();
server.listen(port, host, () => {
  process.stdout.write(`11vatedTech AI Roblox Studio Lab: http://${host}:${port}\n`);
});

function stop() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
