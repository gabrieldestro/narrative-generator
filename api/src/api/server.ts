import * as dotenv from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { pathToFileURL } from 'url';

import { WorldTemplateRepository } from '../infrastructure/persistence/WorldTemplateRepository.js';
import { LlmService } from '../application/shared/LlmService.js';
import { SessionFactory } from '../application/session/SessionFactory.js';
import { GameService } from '../application/session/GameService.js';
import { CharacterService } from '../application/characters/CharacterService.js';
import { WorldService } from '../application/world/WorldService.js';
import { buildTurnService } from '../application/turn/buildTurnService.js';
import { SessionRepository } from '../infrastructure/persistence/SessionRepository.js';
import { SessionScopeStore } from '../application/session/SessionScopeStore.js';
import { CheckpointRepository } from '../infrastructure/persistence/CheckpointRepository.js';
import { AdminCommandService } from '../application/admin/AdminCommandService.js';
import { CheckpointService } from '../application/session/CheckpointService.js';
import { SetupController } from './controllers/SetupController.js';
import { TurnController } from './controllers/TurnController.js';
import { SavesController } from './controllers/SavesController.js';
import { AdminController } from './controllers/AdminController.js';
import { EnrichController } from './controllers/EnrichController.js';
import { registerGameRoutes } from './routes/gameRoutes.js';
import { PinoLogger } from '../infrastructure/logging/PinoLogger.js';
import { LlmCallLogger } from '../infrastructure/logging/LlmCallLogger.js';
import { LlmContentLogger } from '../infrastructure/logging/LlmContentLogger.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILogger } from '../domain/ports.js';

import { ChatOpenAI } from "@langchain/openai";

export interface AppOptions {
  llmModel?: BaseChatModel;
  worldRepo?: WorldTemplateRepository;
  sessionRepo?: SessionRepository;
  checkpointRepo?: CheckpointRepository;
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
    // Inclui DELETE/PUT/PATCH: sem isso o preflight do navegador bloqueia
    // o `DELETE /api/saves/:id` (front recebia "Falha ao excluir a partida").
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.register(sensible);

  // Instancia dependências do Core caso não sejam fornecidas
  const worldRepo = options.worldRepo ?? new WorldTemplateRepository();
  const sessionRepo = options.sessionRepo ?? new SessionRepository();
  const checkpointRepo = options.checkpointRepo ?? new CheckpointRepository();

  // Hidrata o cache em memória a partir do disco: assim, após um restart da API,
  // as sessões persistem e `GET /api/games/:id/state` continua respondendo.
  const savedBundles = await checkpointRepo.list();
  for (const bundle of savedBundles) {
    sessionRepo.saveSession(bundle.id, bundle.state);
  }
  logger.info('Saves hidratados do disco', { count: savedBundles.length });

  const llmCallLogger = new LlmCallLogger('logs/llm_calls.jsonl');
  const llmContentLogger = new LlmContentLogger('logs/llm_content.jsonl');

  let llmService: LlmService;
  let llmModel: BaseChatModel;
  if (options.llmModel) {
    llmModel = options.llmModel;
    llmService = new LlmService(llmModel, {}, llmCallLogger, logger, llmContentLogger);
  } else {
    llmModel = new ChatOpenAI({
      temperature: 0.7,
      model: process.env.OPENAI_API_MODEL || "gemma-4b",
      apiKey: process.env.OPENAI_API_KEY || "lm-studio",
      configuration: {
        baseURL: process.env.OPENAI_API_BASE || "http://localhost:1234/v1",
      },
    });
    llmService = new LlmService(llmModel, {}, llmCallLogger, logger, llmContentLogger);
  }

  const worldService = new WorldService(llmService, logger);
  // F2 (doc 31): 1 grafo de serviços por campanha (orquestrador + llm +
  // characters com os settings do escopo). Services seguem singletons como
  // código; o estado por campanha vive no store, chaveado por rootId.
  const scopeStore = new SessionScopeStore(undefined, (settings) => {
    const scopeLlm = new LlmService(llmModel, settings, llmCallLogger, logger, llmContentLogger);
    const scopeChars = new CharacterService(scopeLlm, settings, logger);
    const scopeOrchestrator = buildTurnService(llmModel, worldService, scopeChars, scopeLlm, logger, llmCallLogger, llmContentLogger, settings);
    return { orchestrator: scopeOrchestrator, llmService: scopeLlm, characterService: scopeChars };
  });
  const adminCommandService = new AdminCommandService(worldService, llmService, logger);
  const characterService = new CharacterService(llmService, {}, logger);
  const sessionFactory = new SessionFactory(undefined, undefined, undefined, llmService, worldRepo);
  // O orquestrador recebe os agentes por DI (nunca `LlmService`).
  const orchestrator = buildTurnService(llmModel, worldService, characterService, llmService, logger, llmCallLogger, llmContentLogger);
  const gameService = new GameService(
    undefined,
    undefined,
    undefined,
    llmService,
    characterService,
    sessionFactory,
    { godMode: false },
    worldService,
    logger,
    adminCommandService,
    orchestrator,
    llmModel,
    scopeStore,
  );

  const checkpoints = new CheckpointService(checkpointRepo, sessionRepo, logger);

  const setupController = new SetupController(
    worldRepo,
    sessionFactory,
    gameService,
    llmService,
    worldService,
    sessionRepo,
    checkpoints,
    logger,
  );

  const turnController = new TurnController(
    sessionRepo,
    gameService,
    checkpoints,
    logger,
  );

  const savesController = new SavesController(
    checkpointRepo,
    sessionRepo,
    logger,
  );

  const adminController = new AdminController(
    sessionRepo,
    gameService,
    adminCommandService,
    checkpoints,
    logger,
  );

  const enrichController = new EnrichController(llmService, logger);

  registerGameRoutes(app, {
    setup: setupController,
    turn: turnController,
    saves: savesController,
    admin: adminController,
    enrich: enrichController,
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

// Só escuta quando executado diretamente (`tsx src/api/server.ts`).
// Importar este módulo (testes, outros entrypoints) nunca deve abrir porta
// — antes, 2 arquivos de teste importando `buildApp` disputavam a 3000
// (EADDRINUSE + process.exit no worker).
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  void startServer();
}
