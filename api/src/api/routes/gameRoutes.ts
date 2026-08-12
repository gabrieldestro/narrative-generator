import type { FastifyInstance } from 'fastify';
import type { GameController } from '../controllers/GameController.js';

export function registerGameRoutes(fastify: FastifyInstance, controller: GameController) {
  // Lista templates de mundos
  fastify.get('/api/worlds', (req, reply) => controller.listWorlds(req, reply));

  // Lista partidas salvas (tela "Continuar")
  fastify.get('/api/saves', (req, reply) => controller.listSaves(req, reply));

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

  // Processa 1 turno do jogo
  fastify.post('/api/games/:sessionId/turn', {
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
        required: ['playerText'],
        properties: {
          actionType: {
            type: 'string',
            enum: ['observe', 'speak', 'attack', 'sneak', 'use_item', 'interact', 'flee', 'free'],
            default: 'free'
          },
          actionIntent: {
            type: 'string',
            enum: ['curious', 'aggressive', 'cautious', 'friendly', 'intimidating', 'desperate', 'neutral'],
            default: 'neutral'
          },
          playerText: { type: 'string' },
          characterName: { type: 'string' },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.processTurn(req, reply));

  // Processa 1 turno via streaming SSE (Server-Sent Events)
  fastify.post('/api/games/:sessionId/turn/stream', {
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
        required: ['playerText'],
        properties: {
          actionType: {
            type: 'string',
            enum: ['observe', 'speak', 'attack', 'sneak', 'use_item', 'interact', 'flee', 'free'],
            default: 'free'
          },
          actionIntent: {
            type: 'string',
            enum: ['curious', 'aggressive', 'cautious', 'friendly', 'intimidating', 'desperate', 'neutral'],
            default: 'neutral'
          },
          playerText: { type: 'string' },
          characterName: { type: 'string' },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.processTurnStream(req, reply));

  // Observa/detalha um aspecto da cena sem avançar o turno
  fastify.post('/api/games/:sessionId/observe', {
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
        required: ['playerText'],
        properties: {
          playerText: { type: 'string' },
          characterName: { type: 'string' },
          settings: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, (req: any, reply) => controller.observe(req, reply));

  // Consulta o estado do jogo
  fastify.get('/api/games/:sessionId/state', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, (req: any, reply) => controller.getGameState(req, reply));
}
