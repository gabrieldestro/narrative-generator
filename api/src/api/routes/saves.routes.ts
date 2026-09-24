import type { FastifyInstance } from 'fastify';
import type { SavesController } from '../controllers/SavesController.js';

export function registerSavesRoutes(fastify: FastifyInstance, controller: SavesController) {
  // Lista partidas salvas (tela "Continuar" - latest por campanha por padrão; ?all=true para todos)
  fastify.get('/api/saves', (req: any, reply) => controller.listSaves(req, reply));

  // Histórico completo de checkpoints de uma campanha
  fastify.get('/api/saves/:rootId/history', {
    schema: {
      params: {
        type: 'object',
        required: ['rootId'],
        properties: {
          rootId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.listHistory(req, reply));

  // Podar checkpoints antigos (mantém só o mais recente)
  fastify.post('/api/saves/prune', {
    schema: {
      body: {
        type: 'object',
        properties: {
          keepLatest: { type: 'boolean' },
          rootId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.pruneSaves(req, reply));

  // Bundle completo de uma partida salva (restauração)
  fastify.get('/api/saves/:sessionId', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.getSave(req, reply));

  // Apaga uma partida salva (disco + cache)
  fastify.delete('/api/saves/:sessionId', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.deleteSave(req, reply));

  // Apaga a campanha inteira (todos os checkpoints do rootId)
  fastify.delete('/api/saves/campaign/:rootId', {
    schema: {
      params: {
        type: 'object',
        required: ['rootId'],
        properties: {
          rootId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.deleteCampaign(req, reply));
}
