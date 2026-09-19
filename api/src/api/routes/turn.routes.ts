import type { FastifyInstance } from 'fastify';
import type { TurnController } from '../controllers/TurnController.js';

const sessionIdParams = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: { type: 'string' },
  },
} as const;

const turnParams = {
  type: 'object',
  required: ['sessionId', 'turnId'],
  properties: {
    sessionId: { type: 'string' },
    turnId: { type: 'string' },
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
  required: [],
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
  // Turno = 1 ação + reações, em fases sequenciais com visual progressivo:
  // `start` (ação+dado+gate) → N× `react` (1 reator) → `arbiter` →
  // `narrate` → `finish` (commit + checkpoint). Ator por rotação automática
  // (`start` sem `playerText` avança NPC; jogador na vez ⇒ 409).
  fastify.post('/api/games/:sessionId/turn/start', {
    schema: {
      params: sessionIdParams,
      body: turnBody,
    },
  }, (req: any, reply) => controller.startTurn(req, reply));

  fastify.post('/api/games/:sessionId/turn/:turnId/react', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.reactTurn(req, reply));

  fastify.post('/api/games/:sessionId/turn/:turnId/arbiter', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.arbiterTurn(req, reply));

  fastify.post('/api/games/:sessionId/turn/:turnId/narrate', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.narrateTurn(req, reply));

  fastify.post('/api/games/:sessionId/turn/:turnId/finish', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.finishTurn(req, reply));

  // Resume após F5 + abandono explícito (TurnStore em memória, sem TTL).
  fastify.get('/api/games/:sessionId/turn/:turnId/status', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.turnStatus(req, reply));

  fastify.post('/api/games/:sessionId/turn/:turnId/cancel', {
    schema: {
      params: turnParams,
    },
  }, (req: any, reply) => controller.cancelTurn(req, reply));

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
