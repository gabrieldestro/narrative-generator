import { describe, it, expect, beforeEach } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { buildApp } from '../server.js';
import { SessionRepository } from '../SessionRepository.js';
import { WorldTemplateRepository } from '../../WorldTemplateRepository.js';

describe('Fastify Game API', () => {
  let app: ReturnType<typeof buildApp>;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    const fakeLlm = new FakeListChatModel({
      responses: [
        'Narrativa inicial de teste.',
        'Resolução lógica: Sucesso.',
        'Narrativa do turno 1: O jogador avança.',
        '{"newCharacters": [], "removedCharacters": [], "newLocations": []}',
        '{"Elara": "Biblioteca"}',
      ],
    });

    sessionRepo = new SessionRepository();
    const worldRepo = new WorldTemplateRepository();

    app = buildApp({
      llmModel: fakeLlm,
      sessionRepo,
      worldRepo,
    });
  });

  it('GET /api/worlds deve listar templates de mundo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/worlds',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('name');
  });

  it('POST /api/games/new deve criar uma nova sessão a partir de um template', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('sessionId');
    expect(body).toHaveProperty('initialNarrative');
    expect(body).toHaveProperty('state');
    expect(body.state.narrativeStyle).toBeDefined();

    // Garante que salvou no repositório de sessão
    expect(sessionRepo.hasSession(body.sessionId)).toBe(true);
  });

  it('POST /api/games/new deve retornar 400 se o payload for inválido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        invalidField: 'foo',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /api/games/:sessionId/turn deve processar a ação do jogador com enricher de skills', async () => {
    // 1. Cria um jogo primeiro
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    // 2. Executa um turno com actionType 'speak' e actionIntent 'intimidating'
    const turnRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/turn`,
      payload: {
        actionType: 'speak',
        actionIntent: 'intimidating',
        playerText: 'Onde fica a saída?',
      },
    });

    expect(turnRes.statusCode).toBe(200);
    const turnBody = JSON.parse(turnRes.payload);
    expect(turnBody).toHaveProperty('narrative');
    expect(turnBody).toHaveProperty('logicalResolution');
    expect(turnBody).toHaveProperty('updatedState');
  });

  it('POST /api/games/:sessionId/turn/stream deve transmitir eventos SSE durante o turno', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const streamRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/turn/stream`,
      payload: {
        playerText: 'Olho ao redor procurando por perigos.',
      },
    });

    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers['content-type']).toContain('text/event-stream');
    expect(streamRes.payload).toContain('event: start');
    expect(streamRes.payload).toContain('event: done');
  });

  it('GET /api/games/:sessionId/state deve consultar o estado atual do jogo', async () => {
    // 1. Cria um jogo
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    // 2. Consulta o estado
    const stateRes = await app.inject({
      method: 'GET',
      url: `/api/games/${sessionId}/state`,
    });

    expect(stateRes.statusCode).toBe(200);
    const body = JSON.parse(stateRes.payload);
    expect(body.sessionId).toBe(sessionId);
    expect(body.state.characters).toBeDefined();
  });

  it('GET /api/games/:sessionId/state deve retornar 404 para sessão inexistente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/games/nao-existe',
    });

    expect(response.statusCode).toBe(404);
  });
});
