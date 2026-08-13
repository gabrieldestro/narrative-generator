import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEngine } from '../GameEngine.js';
import { SessionFactory } from '../SessionFactory.js';
import { LlmService } from '../LlmService.js';
import { CpuReflectionService } from '../npcAgent/CpuReflectionService.js';
import type { GameState, CharacterTemplate, CpuAgentDecision } from '../../domain/types.js';
import type { IUserInput, IOutputWriter } from '../../domain/ports.js';
import type { IStateRepository } from '../../infrastructure/JsonStateRepository.js';

// ── SessionFactory ──

describe('SessionFactory', () => {
  let mockInput: IUserInput;
  let mockOutput: IOutputWriter;
  let mockRepo: IStateRepository;
  let mockLlmService: LlmService;
  let factory: SessionFactory;

  const playerAric: CharacterTemplate = {
    name: 'Aric',
    description: 'Um guerreiro marcado por batalhas passadas.',
    personality: 'Corajoso e leal.',
    isPlayer: true,
  };

  const companionElara: CharacterTemplate = {
    name: 'Elara',
    description: 'Uma elfa das florestas prateadas.',
    personality: 'Sábia e furtiva.',
  };

  beforeEach(() => {
    mockInput = { question: vi.fn().mockResolvedValue(''), close: vi.fn() };
    mockOutput = { write: vi.fn(), writeLine: vi.fn(), clear: vi.fn() };
    mockRepo = { load: vi.fn(), save: vi.fn() };

    const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
    mockLlmService = new LlmService(mockLlm as any);

    factory = new SessionFactory(mockInput, mockOutput, mockRepo, mockLlmService);
  });

  describe('createNewGame', () => {
    it('deve criar GameState com propriedades corretas para 2 personagens', async () => {
      const state = await factory.createNewGame(
        'Fantasia Medieval',
        'Épico / Poético',
        'Uma taverna escura na encruzilhada dos reinos.',
        [playerAric, companionElara]
      );

      expect(state.narrativeStyle).toBe('Fantasia Medieval');
      expect(state.writingStyle).toBe('Épico / Poético');
      expect(state.worldContext).toBe('Uma taverna escura na encruzilhada dos reinos.');
      expect(state.turnNumber).toBe(1);
      expect(state.history).toEqual([]);
      expect(state.characters).toHaveLength(2);
      expect(state.characters[0]!.isPlayer).toBe(true);
      expect(state.characters[0]!.name).toBe('Aric');
      expect(state.characters[1]!.isPlayer).toBe(false);
      expect(state.characters[1]!.name).toBe('Elara');
      expect(state.characters[1]!.description).toBe('Uma elfa das florestas prateadas.');
    });

    it('deve persistir via repository.save', async () => {
      await factory.createNewGame(
        'Cyberpunk', 'Cômico / Sarcástico', 'Néons brilham.', [playerAric, companionElara]
      );

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedState = vi.mocked(mockRepo.save).mock.calls[0]![0] as GameState;
      expect(savedState.narrativeStyle).toBe('Cyberpunk');
      expect(savedState.turnNumber).toBe(1);
    });

    it('deve atribuir ids sequenciais', async () => {
      const state = await factory.createNewGame(
        'Fantasia', 'Épico', 'Castelo.', [playerAric, companionElara]
      );
      expect(state.characters[0]!.id).toBe('1');
      expect(state.characters[1]!.id).toBe('2');
    });

    it('deve inicializar lastSceneLocation com o local inicial do jogador', async () => {
      const state = await factory.createNewGame(
        'Fantasia', 'Épico', 'Castelo.',
        [{ ...playerAric, initialLocation: 'Salão do Trono' }, companionElara]
      );
      expect(state.lastSceneLocation).toBe('Salão do Trono');
    });

    it('deve inicializar lastSceneLocation via buildFromTemplate', () => {
      const state = factory.buildFromTemplate({
        narrativeStyle: 'Fantasia Medieval',
        writingStyle: 'Épico / Poético',
        worldContext: 'Um castelo antigo.',
        name: 'Castelo',
        description: 'Castelo do reino',
        characters: [{ ...playerAric, initialLocation: 'Pátio' }, companionElara],
      });
      expect(state.lastSceneLocation).toBe('Pátio');
    });

    it('deve aceitar N personagens no template', async () => {
      const chars: CharacterTemplate[] = [
        playerAric, companionElara,
        { name: 'Marcus', description: 'Ladrão.', personality: 'Cínico.' },
        { name: 'Luna', description: 'Maga.', personality: 'Misteriosa.' },
        { name: 'Thorn', description: 'Bárbaro.', personality: 'Violento.' },
      ];

      const state = await factory.createNewGame('Fantasia', 'Épico', 'Castelo.', chars);

      expect(state.characters).toHaveLength(5);
      expect(state.characters[4]!.name).toBe('Thorn');
      expect(state.characters[4]!.id).toBe('5');
    });
  });

  describe('setupNewGame – criação de personagem em cenário customizado', () => {
    it('deve criar jogo apenas com o jogador (sem NPCs)', async () => {
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('1')       // gênero
        .mockResolvedValueOnce('1')       // tom
        .mockResolvedValueOnce('Aric')    // nome
        .mockResolvedValueOnce('n');      // add NPC? → não

      const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
      const llmService = new LlmService(mockLlm as any);
      const genContextSpy = vi.spyOn(llmService, 'generateInitialContext')
        .mockResolvedValue('Floresta sombria.');
      const genPlayerSpy = vi.spyOn(llmService, 'generatePlayerCharacter')
        .mockResolvedValue(['Um aventureiro.', 'Determinado.']);
      const localFactory = new SessionFactory(mockInput, mockOutput, mockRepo, llmService);

      const state = await localFactory.setupNewGame();

      expect(state.characters).toHaveLength(1);
      expect(state.characters[0]!.name).toBe('Aric');
      expect(state.characters[0]!.isPlayer).toBe(true);
      expect(genContextSpy).toHaveBeenCalledOnce();
      expect(genPlayerSpy).toHaveBeenCalledOnce();
    });

    it('deve adicionar NPC preenchendo dados manualmente', async () => {
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('1')       // gênero
        .mockResolvedValueOnce('1')       // tom
        .mockResolvedValueOnce('Aric')    // nome
        .mockResolvedValueOnce('s')       // add NPC
        .mockResolvedValueOnce('Marcus')  // nome NPC
        .mockResolvedValueOnce('s')       // manual
        .mockResolvedValueOnce('Ex-soldado.')  // desc
        .mockResolvedValueOnce('Cínico.')     // personalidade
        .mockResolvedValueOnce('n');      // add NPC? → não

      const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
      const llmService = new LlmService(mockLlm as any);
      vi.spyOn(llmService, 'generateInitialContext').mockResolvedValue('Sala escura.');
      vi.spyOn(llmService, 'generatePlayerCharacter').mockResolvedValue(['Herói.', 'Bravo.']);
      const localFactory = new SessionFactory(mockInput, mockOutput, mockRepo, llmService);

      const state = await localFactory.setupNewGame();

      expect(state.characters).toHaveLength(2);
      expect(state.characters[1]!.name).toBe('Marcus');
      expect(state.characters[1]!.description).toBe('Ex-soldado.');
      expect(state.characters[1]!.personality).toBe('Cínico.');
    });

    it('deve adicionar NPC gerado por IA', async () => {
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('1')       // gênero
        .mockResolvedValueOnce('1')       // tom
        .mockResolvedValueOnce('Aric')    // nome
        .mockResolvedValueOnce('s')       // add NPC
        .mockResolvedValueOnce('Elara')   // nome NPC
        .mockResolvedValueOnce('n')       // manual? → não
        .mockResolvedValueOnce('n');      // add NPC? → não

      const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
      const llmService = new LlmService(mockLlm as any);
      vi.spyOn(llmService, 'generateInitialContext').mockResolvedValue('Floresta.');
      vi.spyOn(llmService, 'generatePlayerCharacter').mockResolvedValue(['Herói.', 'Bravo.']);
      const genNpcSpy = vi.spyOn(llmService, 'generateCompanionDetails')
        .mockResolvedValue(['Uma elfa arqueira.', 'Sábia.']);
      const localFactory = new SessionFactory(mockInput, mockOutput, mockRepo, llmService);

      const state = await localFactory.setupNewGame();

      expect(state.characters).toHaveLength(2);
      expect(state.characters[1]!.name).toBe('Elara');
      expect(state.characters[1]!.description).toBe('Uma elfa arqueira.');
      expect(state.characters[1]!.personality).toBe('Sábia.');
      expect(genNpcSpy).toHaveBeenCalledOnce();
    });

    it('deve adicionar múltiplos NPCs (manual + IA)', async () => {
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('1')       // gênero
        .mockResolvedValueOnce('1')       // tom
        .mockResolvedValueOnce('Aric')    // nome
        .mockResolvedValueOnce('s')       // add NPC 1
        .mockResolvedValueOnce('Marcus')  // nome NPC 1
        .mockResolvedValueOnce('s')       // manual
        .mockResolvedValueOnce('Ladrão.') // desc
        .mockResolvedValueOnce('Ágil.')   // personalidade
        .mockResolvedValueOnce('s')       // add NPC 2
        .mockResolvedValueOnce('Luna')    // nome NPC 2
        .mockResolvedValueOnce('n')       // manual? → não
        .mockResolvedValueOnce('n');      // add NPC? → não

      const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
      const llmService = new LlmService(mockLlm as any);
      vi.spyOn(llmService, 'generateInitialContext').mockResolvedValue('Caverna.');
      vi.spyOn(llmService, 'generatePlayerCharacter').mockResolvedValue(['Herói.', 'Bravo.']);
      vi.spyOn(llmService, 'generateCompanionDetails')
        .mockResolvedValue(['Maga dos bosques.', 'Misteriosa.']);
      const localFactory = new SessionFactory(mockInput, mockOutput, mockRepo, llmService);

      const state = await localFactory.setupNewGame();

      expect(state.characters).toHaveLength(3);
      expect(state.characters[1]!.name).toBe('Marcus');
      expect(state.characters[2]!.name).toBe('Luna');
    });
  });
});

// ── GameEngine ──

describe('GameEngine', () => {
  let mockInput: IUserInput;
  let mockOutput: IOutputWriter;
  let mockRepo: IStateRepository;
  let mockLlmService: LlmService;
  let mockCpuReflection: CpuReflectionService;
  let mockSessionFactory: SessionFactory;
  let engine: GameEngine;

  const defaultDecision: CpuAgentDecision = {
    reasoning: 'Preciso agir conforme minha natureza.',
    updatedObjective: 'Explorar a área em busca de pistas.',
    action: 'Elara segue em silêncio.',
  };

  const existingState: GameState = {
    worldContext: 'Uma floresta sombria.',
    narrativeStyle: 'Terror de Sobrevivência',
    writingStyle: 'Terror Sombrio',
    turnNumber: 3,
    history: ['Turno 1: Entrada', 'Turno 2: Exploração'],
    characters: [
      { id: '1', name: 'Aric', description: 'Herói', personality: 'Corajoso', isPlayer: true },
      { id: '2', name: 'Elara', description: 'Elfa sombria', personality: 'Furtiva', isPlayer: false },
    ],
  };

  beforeEach(() => {
    mockInput = { question: vi.fn().mockResolvedValue(''), close: vi.fn() };
    mockOutput = { write: vi.fn(), writeLine: vi.fn(), clear: vi.fn() };
    mockRepo = { load: vi.fn(), save: vi.fn() };

    const mockLlm = { invoke: vi.fn().mockResolvedValue({ content: 'mock' }), stream: vi.fn() };
    mockLlmService = new LlmService(mockLlm as any);

    // Mock CpuReflectionService
    mockCpuReflection = {
      reflectAndAct: vi.fn<(...args: any[]) => Promise<CpuAgentDecision>>().mockResolvedValue(defaultDecision),
      recordArbiterResult: vi.fn(),
    } as unknown as CpuReflectionService;

    mockSessionFactory = new SessionFactory(mockInput, mockOutput, mockRepo, mockLlmService);
    engine = new GameEngine(mockInput, mockOutput, mockRepo, mockLlmService, mockCpuReflection, mockSessionFactory, { arbiterHistoryTurns: 0 });
  });

  it('deve carregar save e executar um turno', async () => {
    vi.mocked(mockRepo.load).mockResolvedValue(JSON.parse(JSON.stringify(existingState)));
    vi.mocked(mockInput.question)
      .mockResolvedValueOnce('s')        // carregar save
      .mockResolvedValueOnce('')         // Enter para continuar
      .mockResolvedValueOnce('Explorar a caverna')  // ação do jogador
      .mockResolvedValueOnce('n');       // continuar? → não

    vi.spyOn(mockLlmService, 'arbitrateLogic')
      .mockResolvedValue('Aric explorou -> Sucesso. Elara seguiu -> Sucesso.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Aric avança corajosamente...');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Caverna', Elara: 'Caverna' });

    await engine.start();

    const savedState = vi.mocked(mockRepo.save).mock.calls.find(
      (call) => (call[0] as GameState).turnNumber === 4
    )?.[0] as GameState;
    expect(savedState).toBeDefined();
    expect(savedState.turnNumber).toBe(4);
    expect(mockCpuReflection.reflectAndAct).toHaveBeenCalledOnce();
  });

  it('deve limitar o histórico ao memoryWindowSize e disparar sumarização', async () => {
    const localEngine = new GameEngine(mockInput, mockOutput, mockRepo, mockLlmService, mockCpuReflection, mockSessionFactory, { memoryWindowSize: 2, arbiterHistoryTurns: 0 });

    const longHistory = ['Turno 1: Entrada na floresta...', 'Turno 2: Encontro com a criatura...'];
    const baseState = JSON.parse(JSON.stringify(existingState));
    const loadedState: GameState = { ...baseState, turnNumber: 3, history: longHistory, longTermSummary: 'Resumo inicial.' };
    vi.mocked(mockRepo.load).mockResolvedValue(loadedState);

    vi.mocked(mockInput.question)
      .mockResolvedValueOnce('s')
      .mockResolvedValueOnce('')         // Enter para continuar
      .mockResolvedValueOnce('Ação de teste')
      .mockResolvedValueOnce('n');

    vi.spyOn(mockLlmService, 'arbitrateLogic').mockResolvedValue('Sucesso.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Cena narrada.');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Floresta', Elara: 'Floresta' });

    const summarizeSpy = vi.spyOn(mockLlmService, 'summarizeMemory').mockResolvedValue('Novo resumo consolidado.');
    const updateCtxSpy = vi.spyOn(mockLlmService, 'updateWorldContext').mockResolvedValue('Cenário atualizado.');

    await localEngine.start();

    const savedState = vi.mocked(mockRepo.save).mock.calls.find(
      (call) => (call[0] as GameState).turnNumber === 4
    )?.[0] as GameState;
    
    expect(savedState).toBeDefined();
    expect(savedState.history).toHaveLength(2);
    expect(summarizeSpy).toHaveBeenCalledWith('Resumo inicial.', [
      'Turno 1: Entrada na floresta...'
    ], expect.any(Number));
    expect(savedState.longTermSummary).toBe('Novo resumo consolidado.');
    expect(updateCtxSpy).toHaveBeenCalledWith('Uma floresta sombria.', 'Cena narrada.', expect.any(Number));
    expect(savedState.worldContext).toBe('Cenário atualizado.');
  });

  it('deve processar o comando /observe sem avançar o turno e registrá-lo no histórico', async () => {
    vi.mocked(mockRepo.load).mockResolvedValue(JSON.parse(JSON.stringify(existingState)));
    vi.mocked(mockInput.question)
      .mockResolvedValueOnce('s')        // carregar save
      .mockResolvedValueOnce('')         // Enter para continuar
      .mockResolvedValueOnce('/observe O que percebo na névoa?')  // comando observe
      .mockResolvedValueOnce('Explorar a caverna')  // ação real do turno
      .mockResolvedValueOnce('n');       // continuar? → não

    const observeSpy = vi.spyOn(mockLlmService, 'generateObservation')
      .mockResolvedValue('A névoa esconde sombras rastejantes.');
    vi.spyOn(mockLlmService, 'arbitrateLogic').mockResolvedValue('Sucesso.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Aric avança pela caverna.');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Caverna', Elara: 'Floresta' });

    await engine.start();

    expect(observeSpy).toHaveBeenCalledTimes(1);
    const [, request, observer] = observeSpy.mock.calls[0] as [GameState, string, string];
    expect(request).toBe('O que percebo na névoa?');
    expect(observer).toBe('Aric');

    // A observação é registrada como "(Turno 3)" (não avança o turno por si só);
    // o turno 4 só existe após a ação real do jogador ser processada.
    const savedState = vi.mocked(mockRepo.save).mock.calls.find(
      (call) => (call[0] as GameState).turnNumber === 4
    )?.[0] as GameState;
    expect(savedState).toBeDefined();
    expect(savedState.history.some(h => h.startsWith('Observação (Turno 3): A névoa esconde sombras rastejantes.'))).toBe(true);
    expect(savedState.history.some(h => h.startsWith('Turno 3: Aric avança pela caverna.'))).toBe(true);
  });

  it('deve processar o comando /narrate respeitando a declaração e resolvendo o estado do mundo sem avançar o turno', async () => {
    vi.mocked(mockRepo.load).mockResolvedValue(JSON.parse(JSON.stringify(existingState)));
    vi.mocked(mockInput.question)
      .mockResolvedValueOnce('s')        // carregar save
      .mockResolvedValueOnce('')         // Enter para continuar
      .mockResolvedValueOnce('/narrate Aric empurra a porta de carvalho e a biblioteca se revela.')  // comando narrate
      .mockResolvedValueOnce('Explorar a caverna')  // ação real do turno
      .mockResolvedValueOnce('n');       // continuar? → não

    const narrateSpy = vi.spyOn(mockLlmService, 'generatePlayerNarration')
      .mockResolvedValue('Aric atravessa a porta de carvalho e a biblioteca proibida se revela na escuridão.');
    vi.spyOn(mockLlmService, 'extractStateChanges').mockResolvedValue({
      inventoryChanges: [{ characterName: 'Aric', action: 'add', item: 'Chave da Biblioteca' }],
      locationChanges: { discovered: [], newConnections: [] },
      characterLifecycle: [],
    });
    vi.spyOn(mockLlmService, 'updateWorldContext').mockResolvedValue('A biblioteca proibida se revela diante de Aric.');
    vi.spyOn(mockLlmService, 'arbitrateLogic').mockResolvedValue('Sucesso.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Aric avança pela caverna.');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Biblioteca Proibida', Elara: 'Floresta' });

    await engine.start();

    // A narração foi gerada a partir da declaração do jogador
    expect(narrateSpy).toHaveBeenCalledTimes(1);
    const [, request, narrator] = narrateSpy.mock.calls[0] as [GameState, string, string];
    expect(request).toBe('Aric empurra a porta de carvalho e a biblioteca se revela.');
    expect(narrator).toBe('Aric');

    // A narração é registrada como "(Turno 3)" sem avançar o turno por si só;
    // o turno 4 só existe após a ação real do jogador ser processada.
    const savedState = vi.mocked(mockRepo.save).mock.calls.find(
      (call) => (call[0] as GameState).turnNumber === 4
    )?.[0] as GameState;
    expect(savedState).toBeDefined();
    expect(savedState.history.some(h => h.startsWith('Narração (Turno 3): Aric atravessa a porta de carvalho'))).toBe(true);
    expect(savedState.characters.find(c => c.name === 'Aric')?.inventory).toContain('Chave da Biblioteca');
    expect(savedState.characters.find(c => c.name === 'Aric')?.currentLocation).toBe('Biblioteca Proibida');
    expect(savedState.worldContext).toBe('A biblioteca proibida se revela diante de Aric.');
  });

  it('god mode: apenas o jogador rola 20; NPCs rolam normalmente', async () => {
    const godEngine = new GameEngine(mockInput, mockOutput, mockRepo, mockLlmService, mockCpuReflection, mockSessionFactory, { godMode: true, arbiterHistoryTurns: 0 });
    const state = JSON.parse(JSON.stringify(existingState));

    // Controla Math.random para o NPC (0.05 → d20 = 2); o jogador ignora o dado
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);

    vi.spyOn(mockLlmService, 'arbitrateLogic').mockResolvedValue('Aric tentou -> Sucesso. Elara tentou -> Falha.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Cena narrada.');
    vi.spyOn(mockLlmService, 'updateWorldContext').mockResolvedValue('Cenário atualizado.');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Floresta', Elara: 'Floresta' });
    vi.spyOn(mockLlmService, 'extractStateChanges').mockResolvedValue({});

    const result = await godEngine.processTurn(state, new Map([['Aric', 'Abrir a porta']]));

    const playerRoll = result.diceRolls.find(r => r.characterName === 'Aric');
    const npcRoll = result.diceRolls.find(r => r.characterName === 'Elara');
    expect(playerRoll?.roll).toBe(20);
    expect(playerRoll?.isGodMode).toBe(true);
    expect(npcRoll?.roll).toBe(2);
    expect(npcRoll?.isGodMode).toBe(false);

    randomSpy.mockRestore();
  });

  it('deve criar novo jogo quando não há save', async () => {
    vi.mocked(mockRepo.load).mockResolvedValue(null);
    vi.mocked(mockInput.question)
      .mockResolvedValueOnce('1')       // gênero
      .mockResolvedValueOnce('1')       // tom
      .mockResolvedValueOnce('Aric')    // nome
      .mockResolvedValueOnce('n')       // add NPC? → não
      .mockResolvedValueOnce('Abrir a porta')  // ação
      .mockResolvedValueOnce('n');      // continuar? → não

    vi.spyOn(mockLlmService, 'generateInitialContext').mockResolvedValue('Floresta.');
    vi.spyOn(mockLlmService, 'generatePlayerCharacter').mockResolvedValue(['Guerreiro.', 'Bravo.']);
    vi.spyOn(mockLlmService, 'generateInitialNarrative').mockResolvedValue('A névoa se dissipa...');
    vi.spyOn(mockLlmService, 'arbitrateLogic').mockResolvedValue('Sucesso.');
    vi.spyOn(mockLlmService, 'narrateFiction').mockResolvedValue('Porta range...');
    vi.spyOn(mockLlmService, 'extractCharacterLocations').mockResolvedValue({ Aric: 'Floresta' });

    await engine.start();

    expect(mockRepo.save).toHaveBeenCalled();
    const savedState = vi.mocked(mockRepo.save).mock.calls.find(
      (call) => (call[0] as GameState).turnNumber === 2
    )?.[0] as GameState;
    expect(savedState).toBeDefined();
    expect(savedState.characters).toHaveLength(1);
    expect(savedState.characters[0]!.name).toBe('Aric');
  });
});
