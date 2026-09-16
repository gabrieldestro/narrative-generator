import type { FastifyInstance } from 'fastify';
import type { AdminController } from '../controllers/AdminController.js';

export function registerAdminRoutes(fastify: FastifyInstance, controller: AdminController) {
  // Executa um comando administrativo (itens, personagens, locais, conceitos, extrações)
  fastify.post('/api/games/:sessionId/command', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          fields: { type: 'object', additionalProperties: true },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.executeCommand(req, reply));
}
