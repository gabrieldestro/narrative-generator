import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpuReflectionService } from '../CpuReflectionService.js';
import { LlmService } from '../../LlmService.js';
import type { Character, GameState, CpuAgentDecision } from '../../../domain/types.js';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: '2',
    name: 'Elara',
    description: 'Elfa da floresta.',
    personality: 'Sábia e furtiva.',
    isPlayer: false,
    longTermObjective: 'Proteger a floresta.',
    currentObjective: 'Proteger a floresta.',
    scratchpad: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    worldContext: 'Uma clareira iluminada pela lua.',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 3,
    history: ['Turno 1: Você entrou na floresta.', 'Turno 2: Ruídos estranhos ao longe.'],
    characters: [],
    ...overrides,
  };
}

const validDecisionJson = JSON.stringify({
  reasoning: 'A porta está trancada e não consigo abrir com força. Preciso encontrar outra entrada.',
  updatedObjective: 'Encontrar uma entrada alternativa para a masmorra.',
  action: 'Eu examino as paredes ao redor da porta em busca de passagens secretas.',
});

describe('CpuReflectionService', () => {
  let mockLlm: { invoke: any; stream: any };
  let llmService: LlmService;
  let service: CpuReflectionService;

  beforeEach(() => {
    mockLlm = { invoke: vi.fn(), stream: vi.fn() };
    llmService = new LlmService(mockLlm as any);
    service = new CpuReflectionService(llmService, 5, 3);
  });

  describe('reflectAndAct', () => {
    it('deve parsear JSON válido e retornar CpuAgentDecision', async () => {
      mockLlm.invoke.mockResolvedValue({ content: validDecisionJson });

      const decision = await service.reflectAndAct(makeState(), makeChar());

      expect(decision.reasoning).toBe('A porta está trancada e não consigo abrir com força. Preciso encontrar outra entrada.');
      expect(decision.updatedObjective).toBe('Encontrar uma entrada alternativa para a masmorra.');
      expect(decision.action).toBe('Eu examino as paredes ao redor da porta em busca de passagens secretas.');
    });

    it('deve parsear JSON dentro de code block ```json ```', async () => {
      mockLlm.invoke.mockResolvedValue({ content: '```json\n' + validDecisionJson + '\n```' });

      const decision = await service.reflectAndAct(makeState(), makeChar());

      expect(decision.action).toBe('Eu examino as paredes ao redor da porta em busca de passagens secretas.');
    });

    it('deve parsear JSON dentro de code block ``` ``` (sem lang)', async () => {
      mockLlm.invoke.mockResolvedValue({ content: '```\n' + validDecisionJson + '\n```' });

      const decision = await service.reflectAndAct(makeState(), makeChar());

      expect(decision.action).toBe('Eu examino as paredes ao redor da porta em busca de passagens secretas.');
    });

    it('deve atualizar char.currentObjective com o campo updatedObjective', async () => {
      mockLlm.invoke.mockResolvedValue({ content: validDecisionJson });

      const char = makeChar();
      await service.reflectAndAct(makeState(), char);

      expect(char.currentObjective).toBe('Encontrar uma entrada alternativa para a masmorra.');
    });

    it('deve tentar novamente se o JSON for inválido e eventualmente ter sucesso', async () => {
      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'não é json' })
        .mockResolvedValueOnce({ content: validDecisionJson });

      const decision = await service.reflectAndAct(makeState(), makeChar());

      expect(decision.action).toBe('Eu examino as paredes ao redor da porta em busca de passagens secretas.');
      expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
    });

    it('deve lançar erro após 3 tentativas consecutivas com JSON inválido', async () => {
      mockLlm.invoke
        .mockResolvedValueOnce({ content: 'não é json' })
        .mockResolvedValueOnce({ content: 'ainda não é json' })
        .mockResolvedValueOnce({ content: '{' });  // JSON inválido

      await expect(service.reflectAndAct(makeState(), makeChar())).rejects.toThrow(
        /CpuReflectionService.reflectAndAct falhou após 3 tentativas/
      );
      expect(mockLlm.invoke).toHaveBeenCalledTimes(3);
    });

    it('deve lançar erro se "reasoning" for vazio', async () => {
      mockLlm.invoke.mockResolvedValue({ content: JSON.stringify({ reasoning: '', updatedObjective: 'X', action: 'Y' }) });
      await expect(service.reflectAndAct(makeState(), makeChar())).rejects.toThrow();
    });

    it('deve lançar erro se "updatedObjective" estiver ausente', async () => {
      mockLlm.invoke.mockResolvedValue({ content: JSON.stringify({ reasoning: 'X', action: 'Y' }) });
      await expect(service.reflectAndAct(makeState(), makeChar())).rejects.toThrow();
    });

    it('deve lançar erro se "action" estiver ausente', async () => {
      mockLlm.invoke.mockResolvedValue({ content: JSON.stringify({ reasoning: 'X', updatedObjective: 'Y' }) });
      await expect(service.reflectAndAct(makeState(), makeChar())).rejects.toThrow();
    });
  });

  describe('recordArbiterResult', () => {
    it('deve adicionar ScratchpadEntry com result success ao scratchpad', () => {
      const char = makeChar({ currentObjective: 'Abrir a porta' });
      const resolution = 'Elara tentou abrir a porta -> Sucesso porque a porta estava destrancada.';
      service.recordArbiterResult(char, 3, resolution);

      expect(char.scratchpad).toHaveLength(1);
      expect(char.scratchpad![0]!.turn).toBe(3);
      expect(char.scratchpad![0]!.objective).toBe('Abrir a porta');
      expect(char.scratchpad![0]!.result).toBe('success');
    });

    it('deve adicionar ScratchpadEntry com result failure ao scratchpad', () => {
      const char = makeChar({ currentObjective: 'Arrombar a fechadura' });
      const resolution = 'Elara tentou arrombar a fechadura -> Falha porque a fechadura é muito complexa.';
      service.recordArbiterResult(char, 4, resolution);

      expect(char.scratchpad).toHaveLength(1);
      expect(char.scratchpad![0]!.result).toBe('failure');
    });

    it('deve ignorar player characters', () => {
      const char = makeChar({ isPlayer: true });
      service.recordArbiterResult(char, 3, 'Qualquer coisa');
      expect(char.scratchpad).toHaveLength(0);
    });

    it('não deve adicionar entrada se não encontrar match no output do árbitro', () => {
      const char = makeChar();
      const resolution = 'Kael tentou pular a janela -> Sucesso.';
      service.recordArbiterResult(char, 3, resolution);
      expect(char.scratchpad).toHaveLength(0);
    });

    it('deve truncar o scratchpad a 5 entradas', () => {
      const char = makeChar({
        scratchpad: [
          { turn: 1, objective: 'A', action: 'a', result: 'failure' as const, reasoning: '' },
          { turn: 2, objective: 'B', action: 'b', result: 'failure' as const, reasoning: '' },
          { turn: 3, objective: 'C', action: 'c', result: 'failure' as const, reasoning: '' },
          { turn: 4, objective: 'D', action: 'd', result: 'failure' as const, reasoning: '' },
          { turn: 5, objective: 'E', action: 'e', result: 'failure' as const, reasoning: '' },
        ],
      });
      const resolution = 'Elara tentou algo -> Sucesso.';
      service.recordArbiterResult(char, 6, resolution);

      expect(char.scratchpad).toHaveLength(5);
      expect(char.scratchpad![0]!.turn).toBe(2); // entrou no lugar do turno 1
      expect(char.scratchpad![4]!.turn).toBe(6); // última é a nova
    });

    it('deve inicializar scratchpad se não existir', () => {
      const char = makeChar();
      delete (char as any).scratchpad;
      const resolution = 'Elara tentou algo -> Sucesso.';
      service.recordArbiterResult(char, 1, resolution);
      expect(char.scratchpad).toHaveLength(1);
    });
  });
});

describe('CpuReflectionService — integração com LlmService real mockado', () => {
  it('deve funcionar com retry e saída visível no output mock', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn() };
    const llmService = new LlmService(mockLlm as any);
    const service = new CpuReflectionService(llmService, 5, 3);
    const output = { write: vi.fn(), writeLine: vi.fn(), clear: vi.fn() };

    // Falha na primeira, sucesso na segunda
    mockLlm.invoke
      .mockResolvedValueOnce({ content: 'invalid' })
      .mockResolvedValueOnce({ content: validDecisionJson });

    const decision = await service.reflectAndAct(makeState(), makeChar(), output);

    expect(decision.action).toBe('Eu examino as paredes ao redor da porta em busca de passagens secretas.');
    expect(output.writeLine).toHaveBeenCalledWith(
      expect.stringContaining('[Agente] Elara: tentativa 1/3 falhou')
    );
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
  });
});
