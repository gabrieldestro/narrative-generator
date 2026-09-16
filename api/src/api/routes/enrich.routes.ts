import type { FastifyInstance } from 'fastify';
import type { EnrichController } from '../controllers/EnrichController.js';

export function registerEnrichRoutes(fastify: FastifyInstance, enrichController: EnrichController) {
  // Enriquecer um campo do formulário de cenário customizado via LLM
  fastify.post('/api/games/enrich', {
    schema: {
      body: {
        type: 'object',
        required: ['field', 'value'],
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          context: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => enrichController.enrich(req, reply));
}
