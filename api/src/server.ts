import * as dotenv from 'dotenv';
import { startServer } from './api/server.js';
import { PinoLogger } from './infrastructure/PinoLogger.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const logger = new PinoLogger();

startServer(PORT, HOST).catch((err) => {
  logger.error("Erro ao iniciar o servidor HTTP Fastify", err instanceof Error ? err : new Error(String(err)));
});
