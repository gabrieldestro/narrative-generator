import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { buildApp } from '../server.js';
import { SessionRepository } from '../../infrastructure/SessionRepository.js';
import { FileSaveStore } from '../../infrastructure/FileSaveStore.js';
import { WorldTemplateRepository } from '../../infrastructure/WorldTemplateRepository.js';

describe('Fastify Game API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionRepo: SessionRepository;
  let saveDir: string;
  let saveStore: FileSaveStore;

  beforeEach(async () => {
    saveDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saves-api-test-'));
    saveStore = new FileSaveStore(saveDir);

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

    app = await buildApp({
      llmModel: fakeLlm,
      sessionRepo,
      worldRepo,
      saveStore,
    });
  });

  afterEach(async () => {
    await fs.rm(saveDir, { recursive: true, force: true });
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

  it('POST /api/games/:sessionId/observe deve detalhar a cena sem avançar o turno', async () => {
    const fakeLlm = new FakeListChatModel({
      responses: [
        'Narrativa inicial de teste.',
        '{}',
        'Observação detalhada da cena: a porta de carvalho range com o vento.',
      ],
    });
    sessionRepo = new SessionRepository();
    app = await buildApp({
      llmModel: fakeLlm,
      sessionRepo,
      worldRepo: new WorldTemplateRepository(),
      saveStore: new FileSaveStore(saveDir),
    });

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
    const createdState = JSON.parse(createRes.payload).state;
    const turnBefore = createdState.turnNumber;

    // 2. Executa uma observação
    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/observe`,
      payload: {
        playerText: 'O que percebo na porta de carvalho?',
      },
    });

    expect(observeRes.statusCode).toBe(200);
    const body = JSON.parse(observeRes.payload);
    expect(body).toHaveProperty('observation');
    expect(body.observation).toContain('porta de carvalho');
    expect(body).toHaveProperty('updatedState');

    // A observação entra no histórico mas não avança o turno
    expect(body.updatedState.turnNumber).toBe(turnBefore);
    const lastEntry = body.updatedState.history[body.updatedState.history.length - 1];
    expect(lastEntry).toContain(`Observação (Turno ${turnBefore}):`);
  });

  it('POST /api/games/:sessionId/observe deve retornar 400 sem playerText', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/observe`,
      payload: {},
    });

    expect(observeRes.statusCode).toBe(400);
  });

  it('POST /api/games/:sessionId/observe deve retornar 404 para sessão inexistente', async () => {
    const observeRes = await app.inject({
      method: 'POST',
      url: '/api/games/nao-existe/observe',
      payload: { playerText: 'Observo o ambiente.' },
    });

    expect(observeRes.statusCode).toBe(404);
  });

  it('POST /api/games/:sessionId/narrate deve narrar a declaração do jogador e resolver o estado sem avançar o turno', async () => {
    const fakeLlm = new FakeListChatModel({
      responses: [
        'Narrativa inicial de teste.',
        '{}',
        'Narração declarada: Darian atravessa a porta de carvalho e revela a biblioteca proibida, onde poeira dourada dança no ar.',
        '{"inventoryChanges": [{"characterName": "Darian", "action": "add", "item": "Chave da Biblioteca"}]}',
        'A Biblioteca Proibida, coberta de teias de aranha e poeira dourada.',
        '{"Darian": "Biblioteca Proibida"}',
      ],
    });
    sessionRepo = new SessionRepository();
    app = await buildApp({
      llmModel: fakeLlm,
      sessionRepo,
      worldRepo: new WorldTemplateRepository(),
      saveStore: new FileSaveStore(saveDir),
    });

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
    const createdState = JSON.parse(createRes.payload).state;
    const turnBefore = createdState.turnNumber;

    // 2. Executa uma narração declarada
    const narrateRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/narrate`,
      payload: {
        playerText: 'Darian empurra a porta de carvalho que range, revelando a biblioteca proibida.',
      },
    });

    expect(narrateRes.statusCode).toBe(200);
    const body = JSON.parse(narrateRes.payload);
    expect(body).toHaveProperty('narration');
    expect(body.narration).toContain('porta de carvalho');
    expect(body).toHaveProperty('updatedState');

    // A narração entra no histórico mas não avança o turno
    expect(body.updatedState.turnNumber).toBe(turnBefore);
    const lastEntry = body.updatedState.history[body.updatedState.history.length - 1];
    expect(lastEntry).toContain(`Narração (Turno ${turnBefore}):`);

    // O estado do mundo foi resolvido: novo item no inventário, novo contexto e nova localização
    const darian = body.updatedState.characters.find((c: { name: string }) => c.name === 'Darian');
    expect(darian.inventory).toContain('Chave da Biblioteca');
    expect(darian.currentLocation).toBe('Biblioteca Proibida');
    expect(body.updatedState.worldContext).toContain('Biblioteca Proibida');
  });

  it('POST /api/games/:sessionId/narrate deve retornar 400 sem playerText', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const narrateRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/narrate`,
      payload: {},
    });

    expect(narrateRes.statusCode).toBe(400);
  });

  it('POST /api/games/:sessionId/narrate deve retornar 404 para sessão inexistente', async () => {
    const narrateRes = await app.inject({
      method: 'POST',
      url: '/api/games/nao-existe/narrate',
      payload: { playerText: 'Narro a cena.' },
    });

    expect(narrateRes.statusCode).toBe(404);
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

  it('POST /api/games/new -> GET /api/saves lista a partida com metadados corretos', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const listRes = await app.inject({ method: 'GET', url: '/api/saves' });
    expect(listRes.statusCode).toBe(200);

    const bundles = JSON.parse(listRes.payload);
    const bundle = bundles.find((b: { id: string }) => b.id === sessionId);
    expect(bundle).toBeDefined();
    expect(bundle.mode).toBe('template');
    expect(bundle.title).toBeDefined();
    expect(bundle.turnNumber).toBe(1);
    expect(bundle.createdAt).toBeDefined();
    expect(bundle.updatedAt).toBeDefined();
    expect(bundle.lastNarrative).toBeDefined();
    expect(bundle.state.history.length).toBeGreaterThanOrEqual(1);
  });

  it('POST turn -> GET /api/saves/:id reflete novo turnNumber e updatedAt', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const beforeRes = await app.inject({ method: 'GET', url: `/api/saves/${sessionId}` });
    const beforeBundle = JSON.parse(beforeRes.payload);

    const turnRes = await app.inject({
      method: 'POST',
      url: `/api/games/${sessionId}/turn`,
      payload: { playerText: 'Avanço pela masmorra com cuidado.' },
    });
    expect(turnRes.statusCode).toBe(200);

    const afterRes = await app.inject({ method: 'GET', url: `/api/saves/${sessionId}` });
    const afterBundle = JSON.parse(afterRes.payload);
    expect(afterBundle.turnNumber).toBeGreaterThan(beforeBundle.turnNumber);
    expect(afterBundle.updatedAt >= beforeBundle.updatedAt).toBe(true);
    expect(afterBundle.state.history.length).toBeGreaterThan(beforeBundle.state.history.length);
  });

  it('restart simulado: novo buildApp com o mesmo diretório de saves mantém a sessão', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const restartedApp = await buildApp({
      llmModel: new FakeListChatModel({ responses: [] }),
      sessionRepo: new SessionRepository(),
      worldRepo: new WorldTemplateRepository(),
      saveStore: new FileSaveStore(saveDir),
    });

    const stateRes = await restartedApp.inject({
      method: 'GET',
      url: `/api/games/${sessionId}/state`,
    });
    expect(stateRes.statusCode).toBe(200);
    const body = JSON.parse(stateRes.payload);
    expect(body.sessionId).toBe(sessionId);
    expect(body.state.history.length).toBeGreaterThan(0);
  });

  it('DELETE /api/saves/:id remove do disco e do cache', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const delRes = await app.inject({ method: 'DELETE', url: `/api/saves/${sessionId}` });
    expect(delRes.statusCode).toBe(204);

    const getSave = await app.inject({ method: 'GET', url: `/api/saves/${sessionId}` });
    expect(getSave.statusCode).toBe(404);

    const getState = await app.inject({ method: 'GET', url: `/api/games/${sessionId}/state` });
    expect(getState.statusCode).toBe(404);
  });

  it('bundle de save não deve conter settings', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: {
        mode: 'template',
        templateName: 'fantasia_masmorra.json',
        settings: { debug: true },
      },
    });
    const { sessionId } = JSON.parse(createRes.payload);

    const saveRes = await app.inject({ method: 'GET', url: `/api/saves/${sessionId}` });
    const bundle = JSON.parse(saveRes.payload);
    expect(bundle).not.toHaveProperty('settings');
    expect(bundle.state).not.toHaveProperty('settings');
  });

  it('POST /api/games/enrich deve retornar texto enriquecido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/enrich',
      payload: {
        field: 'Descrição de Aria',
        value: 'Ladina ágil',
        context: {
          narrativeStyle: 'Fantasia Medieval',
          writingStyle: 'Épico',
          worldContext: 'Mundo sombrio',
          characters: [{ name: 'Aria', description: 'Ladina ágil' }],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('enriched');
    expect(typeof body.enriched).toBe('string');
    expect(body.enriched.length).toBeGreaterThan(0);
  });

  it('POST /api/games/enrich deve retornar 400 sem field/value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/enrich',
      payload: { field: 'x' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/games/new (mode custom + world) deve criar jogo estruturado', async () => {
    const world = {
      name: 'Mundo Custom',
      description: 'desc',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico',
      worldContext: 'Um mundo de teste',
      characters: [
        { name: 'Aria', description: 'Ladina', personality: 'Astuta', isPlayer: true, initialLocation: 'Taverna', inventory: ['Adaga'] },
        { name: 'Brenn', description: 'Guerreiro', personality: 'Leal', isPlayer: false },
      ],
      locations: [{ id: 'l1', name: 'Taverna', description: '', connectedTo: [] }],
      concepts: [{ id: 'c1', type: 'faction', name: 'Ladinos', description: '' }],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/games/new',
      payload: { mode: 'custom', world },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('sessionId');
    expect(body.state.characters.length).toBe(2);
    expect(body.state.characters[0].name).toBe('Aria');
    expect(body.state.characters[0].currentLocation).toBe('Taverna');
    expect(body.state.characters[0].inventory).toEqual(['Adaga']);
    expect(body.state.characters[0].isPlayer).toBe(true);
    expect(body.state.locations.length).toBe(1);
    expect(body.state.concepts.length).toBe(1);
    expect(body.state.lastSceneLocation).toBe('Taverna');
  });
});