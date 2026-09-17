import { describe, it, expect, vi } from 'vitest';
import { PromptJsonResolver } from '../StructuredResolver.js';

function mockModel(responses: string[]) {
  const queue = [...responses];
  return {
    invoke: vi.fn(async () => ({ content: queue.shift() ?? '{}' })),
  };
}

const SPEC = '{"ok":true}';
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Doc 27, Fase 0 — prova do padrão `resolveJson`.
describe('PromptJsonResolver', () => {
  it('resolve JSON válido sem repair (1 invoke)', async () => {
    const llm = mockModel([JSON.stringify({ hello: 'mundo' })]);
    const resolver = new PromptJsonResolver(llm as any);
    const result = await resolver.resolveJson({
      agent: 'Teste',
      turn: 1,
      system: 'sys',
      human: 'hum',
      schemaSpec: SPEC,
      validate: isRecord,
    });
    expect(result?.value).toEqual({ hello: 'mundo' });
    expect(result?.attempt).toBe(1);
    expect(llm.invoke).toHaveBeenCalledTimes(1);
  });

  it('repara JSON inválido na 2ª chamada', async () => {
    const llm = mockModel(['isso não é JSON', JSON.stringify({ ok: 1 })]);
    const resolver = new PromptJsonResolver(llm as any);
    const result = await resolver.resolveJson({
      agent: 'Teste',
      turn: 1,
      system: 'sys',
      human: 'hum',
      schemaSpec: SPEC,
      validate: isRecord,
    });
    expect(result?.value).toEqual({ ok: 1 });
    expect(llm.invoke).toHaveBeenCalledTimes(2);
  });

  it('retorna null quando o repair falha (agente decide o fallback)', async () => {
    const llm = mockModel(['sempre inválido', 'ainda inválido', 'continua inválido']);
    const resolver = new PromptJsonResolver(llm as any, undefined, undefined, { maxHealRetries: 1 });
    const result = await resolver.resolveJson({
      agent: 'Teste',
      turn: 1,
      system: 'sys',
      human: 'hum',
      schemaSpec: SPEC,
      validate: isRecord,
    });
    expect(result).toBeNull();
  });

  it('validador que rejeita dispara repair', async () => {
    const llm = mockModel([JSON.stringify({ errado: true }), JSON.stringify({ Kael: 'Masmorra' })]);
    const resolver = new PromptJsonResolver(llm as any);
    const isLocationMap = (v: unknown): v is Record<string, string> =>
      typeof v === 'object' && v !== null && Object.values(v).every((x) => typeof x === 'string' && x.length > 0);
    const result = await resolver.resolveJson({
      agent: 'Teste',
      turn: 1,
      system: 'sys',
      human: 'hum',
      schemaSpec: SPEC,
      validate: isLocationMap,
    });
    expect(result?.value).toEqual({ Kael: 'Masmorra' });
    expect(llm.invoke).toHaveBeenCalledTimes(2);
  });
});
