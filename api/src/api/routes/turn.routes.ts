import type { FastifyInstance } from 'fastify';
import type { TurnController } from '../controllers/TurnController.js';

const sessionIdParams = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: { type: 'string' },
  },
} as const;

const playerTextBody = {
  type: 'object',
  required: ['playerText'],
  properties: {
    playerText: { type: 'string' },
    characterName: { type: 'string' },
    settings: { type: 'object', additionalProperties: true },
  },
} as const;

const turnBody = {
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
} as const;

export function registerTurnRoutes(fastify: FastifyInstance, controller: TurnController) {
  // Processa 1 turno do jogo
  fastify.post('/api/games/:sessionId/turn', {
    schema: {
      params: sessionIdParams,
      body: turnBody,
    },
  }, (req: any, reply) => controller.processTurn(req, reply));

  // Observa/detalha um aspecto da cena sem avançar o turno
  fastify.post('/api/games/:sessionId/observe', {
    schema: {
      params: sessionIdParams,
      body: playerTextBody,
    },
  }, (req: any, reply) => controller.observe(req, reply));

  // Narra uma declaração do jogador respeitando o que foi dito e resolve o estado do mundo
  fastify.post('/api/games/:sessionId/narrate', {
    schema: {
      params: sessionIdParams,
      body: playerTextBody,
    },
  }, (req: any, reply) => controller.narrate(req, reply));

  // Consulta o estado do jogo
  fastify.get('/api/games/:sessionId/state', {
    schema: {
      params: sessionIdParams,
    },
  }, (req: any, reply) => controller.getGameState(req, reply));
}
