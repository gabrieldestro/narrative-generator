import type { FastifyInstance } from 'fastify';
import type { SetupController } from '../controllers/SetupController.js';

export function registerSetupRoutes(fastify: FastifyInstance, controller: SetupController) {
  // Lista templates de mundos
  fastify.get('/api/worlds', (req, reply) => controller.listWorlds(req, reply));

  // Salva um cenário customizado como template reutilizável (não cria jogo)
  fastify.post('/api/worlds', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'worldContext'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          narrativeStyle: { type: 'string' },
          writingStyle: { type: 'string' },
          worldContext: { type: 'string' },
          characters: { type: 'array' },
          locations: { type: 'array' },
          concepts: { type: 'array' },
        },
      },
    },
  }, (req: any, reply) => controller.saveWorld(req, reply));

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
          world: { type: 'object', additionalProperties: true },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.createGame(req, reply));
}
