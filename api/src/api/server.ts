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
import { FileSaveStore } from '../infrastructure/FileSaveStore.js';
import { AdminCommandService } from '../application/AdminCommandService.js';
import { GameController } from './controllers/GameController.js';
import { EnrichController } from './controllers/EnrichController.js';
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
  saveStore?: FileSaveStore;
  logger?: ILogger;
}

export async function buildApp(options: AppOptions = {}) {
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
  const saveStore = options.saveStore ?? new FileSaveStore();

  // Hidrata o cache em memória a partir do disco: assim, após um restart da API,
  // as sessões persistem e `GET /api/games/:id/state` continua respondendo.
  const savedBundles = await saveStore.list();
  for (const bundle of savedBundles) {
    sessionRepo.saveSession(bundle.id, bundle.state);
  }
  logger.info('Saves hidratados do disco', { count: savedBundles.length });

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
  const adminCommandService = new AdminCommandService(gameManagementService, llmService, logger);
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
    logger,
    adminCommandService
  );

  const gameController = new GameController(
    worldRepo,
    sessionFactory,
    gameEngine,
    llmService,
    gameManagementService,
    sessionRepo,
    saveStore,
    logger,
    adminCommandService
  );

  const enrichController = new EnrichController(llmService, logger);

  registerGameRoutes(app, gameController, enrichController);

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
  const app = await buildApp({ logger });
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
