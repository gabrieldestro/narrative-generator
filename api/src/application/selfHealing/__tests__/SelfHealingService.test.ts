import { describe, it, expect, vi } from 'vitest';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SelfHealingService } from '../SelfHealingService.js';
import { validateCharacterSheet, validateStateChanges } from '../JsonValidators.js';

const contextOverflowError = new Error(
  "This model's maximum context length is 4096 tokens. However, you requested 5000 tokens (exceeds the context window).",
);

describe('SelfHealingService.invokeWithRetry', () => {
  it('não reduz o budget antes do primeiro erro: primeira chamada usa o máximo', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValue({ content: 'ok' }),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any);

    const budgets: number[] = [];
    const result = await service.invokeWithRetry({
      agent: 'Árbitro',
      turn: 3,
      maxBudget: 7,
      minBudget: 0,
      budgetStep: 1,
      maxRetries: 2,
      build: (budget) => {
        budgets.push(budget);
        return [new SystemMessage('s'), new HumanMessage(`hist:${budget}`)];
      },
    });

    expect(result).toBe('ok');
    expect(budgets).toEqual([7]);
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);
  });

  it('deve retry em context_overflow reduzindo o budget e retornar o conteúdo', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockRejectedValueOnce(contextOverflowError)
        .mockResolvedValueOnce({ content: 'resolução' }),
      stream: vi.fn(),
    };
    const fakeLogger = {
      measure: vi.fn(async (_agent: string, _turn: number, fn: () => Promise<unknown>, _attempt: number) => fn()),
      record: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any, fakeLogger as any);

    const budgets: number[] = [];
    const result = await service.invokeWithRetry({
      agent: 'Árbitro',
      turn: 3,
      maxBudget: 5,
      minBudget: 0,
      budgetStep: 1,
      maxRetries: 2,
      build: (budget) => {
        budgets.push(budget);
        return [new SystemMessage('sistema'), new HumanMessage(`hist:${budget}`)];
      },
    });

    expect(result).toBe('resolução');
    expect(budgets).toEqual([5, 4]);
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
    expect(fakeLogger.measure).toHaveBeenCalledTimes(2);
    expect(fakeLogger.measure.mock.calls[0]![3]).toBe(1);
    expect(fakeLogger.measure.mock.calls[1]![3]).toBe(2);
  });

  it('deve usar startAttempt para continuar a numeração após chamada original', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockRejectedValueOnce(contextOverflowError)
        .mockResolvedValueOnce({ content: 'ok' }),
      stream: vi.fn(),
    };
    const fakeLogger = {
      measure: vi.fn(async (_agent: string, _turn: number, fn: () => Promise<unknown>, _attempt: number) => fn()),
      record: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any, fakeLogger as any);

    await service.invokeWithRetry({
      agent: 'Narrador',
      turn: 1,
      maxBudget: 3,
      startAttempt: 2,
      maxRetries: 2,
      build: (budget) => [new SystemMessage('s'), new HumanMessage(`hist:${budget}`)],
    });

    expect(fakeLogger.measure.mock.calls[0]![3]).toBe(2);
    expect(fakeLogger.measure.mock.calls[1]![3]).toBe(3);
  });

  it('deve propagar imediatamente erros que não são de contexto', async () => {
    const mockLlm = {
      invoke: vi.fn().mockRejectedValueOnce(new Error('rate limit reached')),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any);

    await expect(service.invokeWithRetry({
      agent: 'Árbitro',
      turn: 3,
      maxBudget: 5,
      build: (budget) => [new SystemMessage('s'), new HumanMessage(`hist:${budget}`)],
    })).rejects.toThrow('rate limit reached');

    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);
  });

  it('deve propagar o erro original quando esgotar as tentativas', async () => {
    const mockLlm = {
      invoke: vi.fn().mockRejectedValue(contextOverflowError),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any, undefined, undefined, { maxHealRetries: 1 });

    await expect(service.invokeWithRetry({
      agent: 'Árbitro',
      turn: 3,
      maxBudget: 2,
      minBudget: 0,
      budgetStep: 1,
      build: (budget) => [new SystemMessage('s'), new HumanMessage(`hist:${budget}`)],
    })).rejects.toThrow(contextOverflowError.message);

    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
  });

  it('não tenta retry quando maxRetries é 0', async () => {
    const mockLlm = {
      invoke: vi.fn().mockRejectedValue(contextOverflowError),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any);

    await expect(service.invokeWithRetry({
      agent: 'Árbitro',
      turn: 3,
      maxBudget: 5,
      maxRetries: 0,
      build: (budget) => [new SystemMessage('s'), new HumanMessage(`hist:${budget}`)],
    })).rejects.toThrow(contextOverflowError.message);

    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('SelfHealingService.parseWithRepair', () => {
  const validSheet = JSON.stringify({
    name: 'Ghost',
    description: 'Um mercenário enigmático.',
    personality: 'Cínico e frio.',
    currentLocation: 'Bar O Raio Enferrujado',
  });

  it('retorna imediatamente se o raw já for JSON válido (sem chamadas extras)', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn() };
    const service = new SelfHealingService(mockLlm as any);

    const result = await service.parseWithRepair({
      agent: 'Extrator:Ficha',
      turn: 1,
      raw: validSheet,
      schemaSpec: '{}',
      validate: validateCharacterSheet,
    });

    expect(result?.attempt).toBe(1);
    expect(result?.value).toMatchObject({ name: 'Ghost' });
    expect(mockLlm.invoke).not.toHaveBeenCalled();
  });

  it('repara JSON inválido na 2ª tentativa e retorna o valor com attempt 2', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValueOnce({ content: validSheet }),
      stream: vi.fn(),
    };
    const fakeLogger = {
      measure: vi.fn(async (_agent: string, _turn: number, fn: () => Promise<unknown>, _attempt: number) => fn()),
      record: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any, fakeLogger as any);

    const result = await service.parseWithRepair({
      agent: 'Extrator:Ficha',
      turn: 1,
      raw: 'não é json',
      schemaSpec: '{}',
      validate: validateCharacterSheet,
    });

    expect(result?.attempt).toBe(2);
    expect(result?.value).toMatchObject({ name: 'Ghost' });
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);
    expect(fakeLogger.measure.mock.calls[0]![3]).toBe(2);
  });

  it('repara JSON sintaticamente válido mas com schema errado', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValueOnce({ content: validSheet }),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any);

    const result = await service.parseWithRepair({
      agent: 'Extrator:Ficha',
      turn: 1,
      raw: JSON.stringify({ nome: 'Errado', foo: 'bar' }),
      schemaSpec: '{}',
      validate: validateCharacterSheet,
    });

    expect(result?.attempt).toBe(2);
    expect(result?.value).toMatchObject({ name: 'Ghost' });
  });

  it('retorna null quando todas as tentativas falham', async () => {
    const mockLlm = {
      invoke: vi.fn()
        .mockResolvedValueOnce({ content: 'ainda inválido' })
        .mockResolvedValueOnce({ content: 'mais inválido' }),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any, undefined, undefined, { maxHealRetries: 2 });

    const result = await service.parseWithRepair({
      agent: 'Extrator:Ficha',
      turn: 1,
      raw: 'inválido',
      schemaSpec: '{}',
      validate: validateCharacterSheet,
    });

    expect(result).toBeNull();
    expect(mockLlm.invoke).toHaveBeenCalledTimes(2);
  });

  it('trunca o JSON inválido longo no prompt de reparo (mantém o fim)', async () => {
    const mockLlm = {
      invoke: vi.fn().mockResolvedValueOnce({ content: validSheet }),
      stream: vi.fn(),
    };
    const service = new SelfHealingService(mockLlm as any);

    const longInvalid = 'x'.repeat(1000) + '{' + 'y'.repeat(100) + '}';
    await service.parseWithRepair({
      agent: 'Extrator:Ficha',
      turn: 1,
      raw: longInvalid,
      schemaSpec: '{}',
      validate: validateCharacterSheet,
      maxInputChars: 200,
    });

    const repairHuman = mockLlm.invoke.mock.calls[0]![0][1].content as string;
    expect(repairHuman).toContain('(truncado)');
    expect(repairHuman).toContain('}' as string);
    expect(repairHuman).not.toContain('x'.repeat(1000));
  });

  it('respeita maxHealRetries configurado (0 = sem reparo)', async () => {
    const mockLlm = { invoke: vi.fn(), stream: vi.fn() };
    const service = new SelfHealingService(mockLlm as any, undefined, undefined, { maxHealRetries: 0 });

    const result = await service.parseWithRepair({
      agent: 'Extrator:Estado',
      turn: 1,
      raw: 'inválido',
      schemaSpec: '{}',
      validate: validateStateChanges,
    });

    expect(result).toBeNull();
    expect(mockLlm.invoke).not.toHaveBeenCalled();
  });
});
