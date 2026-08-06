import * as dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

import { WorldTemplateRepository } from '../infrastructure/WorldTemplateRepository.js';
import { LlmService } from '../application/LlmService.js';
import { SessionFactory } from '../application/SessionFactory.js';
import { GameEngine } from '../application/GameEngine.js';
import { CpuReflectionService } from '../application/npcAgent/CpuReflectionService.js';
import { GameManagementService } from '../application/GameManagementService.js';
import { SessionRepository } from '../infrastructure/SessionRepository.js';
import { GameController } from './controllers/GameController.js';
import { registerGameRoutes } from './routes/gameRoutes.js';
import { PinoLogger } from '../infrastructure/PinoLogger.js';
import { LlmCallLogger } from '../infrastructure/LlmCallLogger.js';
import { LlmContentLogger } from '../infrastructure/LlmContentLogger.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILogger } from '../domain/ports.js';

import { ChatOpenAI } from "@langchain/openai";

export interface AppOptions {
  llmModel?: BaseChatModel;
  worldRepo?: WorldTemplateRepository;
  sessionRepo?: SessionRepository;
  logger?: ILogger;
}

export function buildApp(options: AppOptions = {}) {
  const logger = options.logger ?? new PinoLogger();
  const app = Fastify({
    logger: false,
  });
  app.addHook('onRequest', async (_request, _reply) => {
    logger.debug('Requisição recebida');
  });

  app.register(cors, {
    origin: true, // Permite conexões do frontend Angular local
  });

  app.register(sensible);

  // Instancia dependências do Core caso não sejam fornecidas
  const worldRepo = options.worldRepo ?? new WorldTemplateRepository();
  const sessionRepo = options.sessionRepo ?? new SessionRepository();

  const llmCallLogger = new LlmCallLogger('logs/llm_calls.jsonl');
  const llmContentLogger = new LlmContentLogger('logs/llm_content.jsonl');

  let llmService: LlmService;
  if (options.llmModel) {
    llmService = new LlmService(options.llmModel, {}, llmCallLogger, logger, llmContentLogger);
  } else {
    const defaultLlm = new ChatOpenAI({
      temperature: 0.7,
      model: "gemma-4b",
      apiKey: process.env.OPENAI_API_KEY || "lm-studio",
      configuration: {
        baseURL: process.env.OPENAI_API_BASE || "http://localhost:1234/v1",
      },
    });
    llmService = new LlmService(defaultLlm, {}, llmCallLogger, logger, llmContentLogger);
  }

  const gameManagementService = new GameManagementService(llmService, logger);
  const cpuReflectionService = new CpuReflectionService(llmService, {}, logger);
  const sessionFactory = new SessionFactory(undefined, undefined, undefined, llmService, worldRepo);
  const gameEngine = new GameEngine(
    undefined,
    undefined,
    undefined,
    llmService,
    cpuReflectionService,
    sessionFactory,
    { godMode: false },
    gameManagementService,
    logger
  );

  const gameController = new GameController(
    worldRepo,
    sessionFactory,
    gameEngine,
    llmService,
    gameManagementService,
    sessionRepo,
    logger
  );

  registerGameRoutes(app, gameController);

  app.post('/api/logs', async (req, reply) => {
    const body = req.body as { logs?: Array<{ level: string; message: string; context?: Record<string, unknown> }> };
    if (!body?.logs) {
      return reply.status(400).send({ error: 'logs array required' });
    }
    for (const entry of body.logs) {
      switch (entry.level) {
        case 'debug': logger.debug(entry.message, entry.context ?? {}); break;
        case 'info':  logger.info(entry.message, entry.context ?? {}); break;
        case 'warn':  logger.warn(entry.message, entry.context ?? {}); break;
        case 'error': logger.error(entry.message, entry.context ?? {}); break;
      }
    }
    return reply.status(200).send({ received: body.logs.length });
  });

  return app;
}

export async function startServer(port = 3000, host = '0.0.0.0') {
  dotenv.config();

  const logger = new PinoLogger();
  const app = buildApp({ logger });
  try {
    const address = await app.listen({ port, host });
    logger.info('Servidor Narrativo rodando', { address });
    return app;
  } catch (err) {
    logger.error('Erro ao iniciar servidor', err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  }
}

startServer();
