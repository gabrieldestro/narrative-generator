import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEngine } from '../application/GameEngine.js';
import type { GameState } from '../domain/types.js';
import type { IUserInput, IOutputWriter } from '../domain/ports.js';

describe('GameEngine', () => {
  let engine: GameEngine;
  let mockInput: IUserInput;
  let mockOutput: IOutputWriter;
  let mockRepo: { load: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let mockLlm: { invoke: ReturnType<typeof vi.fn>; stream: ReturnType<typeof vi.fn> };

  function createEngine() {
    return new GameEngine(mockInput, mockOutput, mockRepo as any, mockLlm as any);
  }

  beforeEach(() => {
    mockInput = {
      question: vi.fn().mockResolvedValue(''),
      close: vi.fn(),
    };
    mockOutput = {
      write: vi.fn(),
      writeLine: vi.fn(),
      clear: vi.fn(),
    };
    mockRepo = {
      load: vi.fn(),
      save: vi.fn(),
    };
    mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'resposta mockada' }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { content: 'narrativa mockada' };
      }),
    };
    engine = createEngine();
  });

  describe('createNewGame', () => {
    it('deve criar um GameState com todas as propriedades preenchidas corretamente', async () => {
      const state = await engine.createNewGame(
        'Fantasia Medieval',
        'Épico / Poético',
        'Uma taverna escura na encruzilhada dos reinos.',
        'Uma elfa guerreira com cicatrizes de batalha e olhar cansado.'
      );

      expect(state.narrativeStyle).toBe('Fantasia Medieval');
      expect(state.writingStyle).toBe('Épico / Poético');
      expect(state.worldContext).toBe('Uma taverna escura na encruzilhada dos reinos.');
      expect(state.turnNumber).toBe(1);
      expect(state.history).toEqual([]);

      expect(state.characters).toHaveLength(2);
      expect(state.characters[0]!.isPlayer).toBe(true);
      expect(state.characters[0]!.name).toBe('Jogador');
      expect(state.characters[1]!.isPlayer).toBe(false);
      expect(state.characters[1]!.name).toBe('Elara');
      expect(state.characters[1]!.description).toBe(
        'Uma elfa guerreira com cicatrizes de batalha e olhar cansado.'
      );
    });

    it('deve persistir o estado inicial via repository.save', async () => {
      await engine.createNewGame(
        'Cyberpunk',
        'Cômico / Sarcástico',
        'Néons brilham sobre as ruas molhadas.',
        'Uma hacker com jaqueta de couro e implantes cibernéticos.'
      );

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedState = mockRepo.save.mock.calls[0]![0] as GameState;
      expect(savedState.narrativeStyle).toBe('Cyberpunk');
      expect(savedState.writingStyle).toBe('Cômico / Sarcástico');
      expect(savedState.turnNumber).toBe(1);
    });

    it('deve gerar ids sequenciais para os personagens', async () => {
      const state = await engine.createNewGame(
        'Fantasia',
        'Épico',
        'Um castelo.',
        'Uma guarda real.'
      );

      expect(state.characters[0]!.id).toBe('1');
      expect(state.characters[1]!.id).toBe('2');
    });
  });

  describe('start() - ciclo completo de jogo', () => {
    it('deve criar um novo jogo quando não há save e incrementar turnNumber', async () => {
      mockRepo.load.mockResolvedValue(null);
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce('Examino a sala')
        .mockResolvedValueOnce('n');

      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'Uma taverna escura.' })
        .mockResolvedValueOnce({ content: 'Uma elfa misteriosa.' })
        .mockResolvedValueOnce({ content: 'Elara observa o ambiente.' })
        .mockResolvedValueOnce({
          content: 'Jogador examinou a sala -> Sucesso. Elara observou -> Sucesso.',
        });

      await engine.start();

      expect(mockRepo.save).toHaveBeenCalled();
      const savedState = mockRepo.save.mock.calls.find(
        (call) => (call[0] as GameState).turnNumber === 2
      )?.[0] as GameState;
      expect(savedState).toBeDefined();
      expect(savedState.turnNumber).toBe(2);
      expect(savedState.history.length).toBeGreaterThan(0);
    });

    it('deve carregar save existente quando usuário opta por continuar', async () => {
      const existingState: GameState = {
        worldContext: 'Uma floresta sombria.',
        narrativeStyle: 'Terror de Sobrevivência',
        writingStyle: 'Terror Sombrio',
        turnNumber: 3,
        history: ['Turno 1: Entrada', 'Turno 2: Exploração'],
        characters: [
          { id: '1', name: 'Jogador', description: 'Herói', personality: 'Corajoso', isPlayer: true },
          { id: '2', name: 'Elara', description: 'Elfa sombria', personality: 'Furtiva', isPlayer: false },
        ],
      };
      mockRepo.load.mockResolvedValue(existingState);
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('s')
        .mockResolvedValueOnce('Continuo explorando')
        .mockResolvedValueOnce('n');

      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'Elara segue em silêncio.' })
        .mockResolvedValueOnce({
          content: 'Jogador continuou explorando -> Sucesso. Elara seguiu -> Sucesso.',
        });

      await engine.start();

      expect(mockRepo.load).toHaveBeenCalled();
      const savedState = mockRepo.save.mock.calls.find(
        (call) => (call[0] as GameState).turnNumber === 4
      )?.[0] as GameState;
      expect(savedState).toBeDefined();
      expect(savedState.turnNumber).toBe(4);
      expect(savedState.narrativeStyle).toBe('Terror de Sobrevivência');
      expect(savedState.writingStyle).toBe('Terror Sombrio');
    });

    it('deve criar novo jogo quando usuário opta por não carregar save', async () => {
      const existingState: GameState = {
        worldContext: 'Ruínas antigas.',
        narrativeStyle: 'Fantasia Medieval',
        writingStyle: 'Épico / Poético',
        turnNumber: 10,
        history: ['Histórico antigo'],
        characters: [
          { id: '1', name: 'Jogador', description: 'Herói', personality: 'Corajoso', isPlayer: true },
          { id: '2', name: 'Elara', description: 'Maga', personality: 'Sábia', isPlayer: false },
        ],
      };
      mockRepo.load.mockResolvedValue(existingState);
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('n')
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce('2')
        .mockResolvedValueOnce('Ação inicial')
        .mockResolvedValueOnce('n');

      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'Novo contexto gerado.' })
        .mockResolvedValueOnce({ content: 'Nova descrição da Elara.' })
        .mockResolvedValueOnce({ content: 'Elara age.' })
        .mockResolvedValueOnce({ content: 'Sucesso.' });

      await engine.start();

      expect(mockRepo.save).toHaveBeenCalled();
      const savedState = mockRepo.save.mock.calls.find(
        (call) => (call[0] as GameState).turnNumber === 2
      )?.[0] as GameState;
      expect(savedState).toBeDefined();
      expect(savedState.narrativeStyle).toBe('Fantasia Medieval');
      expect(savedState.turnNumber).toBe(2);
    });

    it('deve limitar o histórico a 15 entradas', async () => {
      const longHistory = Array.from({ length: 14 }, (_, i) => `Entrada ${i + 1}`);
      const loadedState: GameState = {
        worldContext: 'Teste.',
        narrativeStyle: 'Fantasia',
        writingStyle: 'Épico',
        turnNumber: 1,
        history: longHistory,
        characters: [
          { id: '1', name: 'Jogador', description: 'Herói', personality: 'Corajoso', isPlayer: true },
          { id: '2', name: 'Elara', description: 'Elfa', personality: 'Furtiva', isPlayer: false },
        ],
      };
      mockRepo.load.mockResolvedValue(loadedState);
      vi.mocked(mockInput.question)
        .mockResolvedValueOnce('s')
        .mockResolvedValueOnce('Ação de teste')
        .mockResolvedValueOnce('n');

      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'Elara age.' })
        .mockResolvedValueOnce({ content: 'Sucesso.' });

      await engine.start();

      const savedState = mockRepo.save.mock.calls.find(
        (call) => (call[0] as GameState).turnNumber === 2
      )?.[0] as GameState;
      expect(savedState).toBeDefined();
      expect(savedState.history.length).toBeLessThanOrEqual(15);
    });
  });
});
