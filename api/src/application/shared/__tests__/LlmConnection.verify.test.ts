import { describe, it, expect } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { applyLlmConnection } from '../LlmConnection.js';

/**
 * F0-a (doc 31): verifica se a mutação in-place de `applyLlmConnection`
 * (model/apiKey/baseURL, inclusive após o client OpenAI ter sido
 * materializado pelo 1º invoke) realmente redireciona as chamadas seguintes.
 *
 * Sem rede: inspeciona os campos que o SDK lê por chamada
 * (`model`, `apiKey`, `clientConfig.baseURL`, `client.baseURL`).
 * Se este teste falhar, o cache de modelos da F3 vira obrigatório (R9).
 */
describe('LlmConnection (F0-a verificação)', () => {
  function makeModel() {
    return new ChatOpenAI({
      model: 'gemma-4b',
      apiKey: 'lm-studio',
      configuration: { baseURL: 'http://localhost:1234/v1' },
    });
  }

  it('aplica model/apiToken/apiUrl (trim + sem trailing slash)', () => {
    const model = makeModel();
    const changed = applyLlmConnection(model, {
      model: 'qwen-8b',
      apiToken: 'token-b',
      apiUrl: 'http://127.0.0.1:4321/v1///',
    });
    const target = model as unknown as Record<string, any>;

    expect(changed).toBe(true);
    expect(target['model']).toBe('qwen-8b');
    expect(target['apiKey']).toBe('token-b');
    const clientConfig = target['clientConfig'] as Record<string, unknown> | undefined;
    const configuration = target['configuration'] as Record<string, unknown> | undefined;
    const baseURL = clientConfig?.['baseURL'] ?? configuration?.['baseURL'];
    expect(baseURL).toBe('http://127.0.0.1:4321/v1');
  });

  it('propaga a URL para o client já materializado (pós-1º invoke)', () => {
    const model = makeModel();
    const target = model as unknown as Record<string, any>;
    // Simula o client lazy do SDK já criado pelo 1º invoke (chat_models/base.js).
    target['client'] = { baseURL: 'http://localhost:1234/v1' };

    applyLlmConnection(model, { apiUrl: 'http://127.0.0.1:9999/v1' });

    expect((target['client'] as Record<string, unknown>)['baseURL']).toBe('http://127.0.0.1:9999/v1');
  });

  it('opts vazias não mutam nada (changed=false)', () => {
    const model = makeModel();
    expect(applyLlmConnection(model, {})).toBe(false);
    expect(applyLlmConnection(model, { model: '   ' })).toBe(false);
  });
});
