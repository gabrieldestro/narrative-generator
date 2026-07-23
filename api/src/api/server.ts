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
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { ChatOpenAI } from "@langchain/openai";

export interface AppOptions {
  llmModel?: BaseChatModel;
  worldRepo?: WorldTemplateRepository;
  sessionRepo?: SessionRepository;
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: true, // Permite conexões do frontend Angular local
  });

  app.register(sensible);

  // Instancia dependências do Core caso não sejam fornecidas
  const worldRepo = options.worldRepo ?? new WorldTemplateRepository();
  const sessionRepo = options.sessionRepo ?? new SessionRepository();

  let llmService: LlmService;
  if (options.llmModel) {
    llmService = new LlmService(options.llmModel);
  } else {
    const defaultLlm = new ChatOpenAI({
      temperature: 0.7,
      model: "gemma-4b",
      apiKey: process.env.OPENAI_API_KEY || "lm-studio",
      configuration: {
        baseURL: process.env.OPENAI_API_BASE || "http://localhost:1234/v1",
      },
    });
    llmService = new LlmService(defaultLlm);
  }

  const gameManagementService = new GameManagementService(llmService);
  const cpuReflectionService = new CpuReflectionService(llmService);
  const sessionFactory = new SessionFactory(undefined, undefined, undefined, llmService, worldRepo);
  const gameEngine = new GameEngine(
    undefined,
    undefined,
    undefined,
    llmService,
    cpuReflectionService,
    sessionFactory,
    { godMode: true },
    gameManagementService
  );

  const gameController = new GameController(
    worldRepo,
    sessionFactory,
    gameEngine,
    llmService,
    sessionRepo
  );

  registerGameRoutes(app, gameController);

  return app;
}

export async function startServer(port = 3000, host = '0.0.0.0') {
  const app = buildApp();
  try {
    const address = await app.listen({ port, host });
    console.log(`🚀 Servidor Narrativo rodando em ${address}`);
    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
