import type { FastifyInstance } from 'fastify';
import type { SetupController } from '../controllers/SetupController.js';
import type { TurnController } from '../controllers/TurnController.js';
import type { SavesController } from '../controllers/SavesController.js';
import type { AdminController } from '../controllers/AdminController.js';
import type { EnrichController } from '../controllers/EnrichController.js';
import { registerSetupRoutes } from './setup.routes.js';
import { registerTurnRoutes } from './turn.routes.js';
import { registerSavesRoutes } from './saves.routes.js';
import { registerAdminRoutes } from './admin.routes.js';
import { registerEnrichRoutes } from './enrich.routes.js';

export interface ApiControllers {
  setup: SetupController;
  turn: TurnController;
  saves: SavesController;
  admin: AdminController;
  enrich?: EnrichController;
}

/** Compõe as rotas da API a partir dos controllers segregados por área (front: new-game, game, history, admin). */
export function registerGameRoutes(fastify: FastifyInstance, controllers: ApiControllers) {
  registerSetupRoutes(fastify, controllers.setup);
  registerTurnRoutes(fastify, controllers.turn);
  registerSavesRoutes(fastify, controllers.saves);
  registerAdminRoutes(fastify, controllers.admin);
  if (controllers.enrich) {
    registerEnrichRoutes(fastify, controllers.enrich);
  }
}
