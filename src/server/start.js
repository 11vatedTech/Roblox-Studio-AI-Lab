import { createLabServer } from './app.js';

const host = '127.0.0.1';
const port = Number(process.env.LAB_PORT ?? '4177');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('LAB_PORT must be an integer from 1024 to 65535.');
}

const shutdownTimeoutMs = Number(process.env.LAB_SHUTDOWN_TIMEOUT_MS ?? '10000');
if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1000 || shutdownTimeoutMs > 60000) {
  throw new Error('LAB_SHUTDOWN_TIMEOUT_MS must be an integer from 1000 to 60000.');
}

const server = createLabServer();
server.on('error', (error) => {
  process.stderr.write(`Lab HTTP server error: ${error?.message ?? 'unknown error'}\n`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  process.stdout.write(`11vatedTech AI Roblox Studio Lab: http://${host}:${port}\n`);
});

let shutdownPromise = null;
function stop(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    process.stdout.write(`Lab graceful shutdown requested by ${signal}.\n`);
    try {
      const result = await server.shutdown({ timeoutMs: shutdownTimeoutMs });
      if (result.forcedConnectionsClosed) {
        process.exitCode = 1;
        process.stderr.write('Lab shutdown exceeded its HTTP drain deadline; active connections were closed.\n');
      }
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`Lab graceful shutdown failed: ${error?.message ?? 'unknown error'}\n`);
      server.closeAllConnections?.();
    }
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => { void stop('SIGINT'); });
process.once('SIGTERM', () => { void stop('SIGTERM'); });
