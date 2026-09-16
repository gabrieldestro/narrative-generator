import type { FastifyInstance } from 'fastify';
import type { SetupController } from '../controllers/SetupController.js';

export function registerSetupRoutes(fastify: FastifyInstance, controller: SetupController) {
  // Lista templates de mundos
  fastify.get('/api/worlds', (req, reply) => controller.listWorlds(req, reply));

  // Cria um novo jogo
  fastify.post('/api/games/new', {
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        properties: {
          mode: { type: 'string', enum: ['template', 'custom'] },
          templateName: { type: 'string' },
          customPrompt: { type: 'string' },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.createGame(req, reply));
}
