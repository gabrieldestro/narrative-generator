import * as dotenv from 'dotenv';
import { startServer } from './api/server.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

startServer(PORT, HOST).catch((err) => {
  console.error("Erro ao iniciar o servidor HTTP Fastify:", err);
});
