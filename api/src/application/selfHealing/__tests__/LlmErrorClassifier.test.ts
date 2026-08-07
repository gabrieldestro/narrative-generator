import { describe, it, expect } from 'vitest';
import { classifyLlmError } from '../LlmErrorClassifier.js';

describe('classifyLlmError', () => {
  it('classifica erro de contexto em inglês (OpenAI-compat)', () => {
    const err = new Error("This model's maximum context length is 8192 tokens. However, you requested 9000 tokens (18 in messages; 8982 in completion). Please reduce the length of the messages or completion.");
    expect(classifyLlmError(err)).toBe('context_overflow');
  });

  it('classifica "context length exceeded"', () => {
    expect(classifyLlmError(new Error('Prompt too long: context length exceeded'))).toBe('context_overflow');
  });

  it('classifica "maximum context length"', () => {
    expect(classifyLlmError(new Error('maximum context length reached'))).toBe('context_overflow');
  });

  it('classifica "too many tokens"', () => {
    expect(classifyLlmError(new Error('too many tokens in the prompt'))).toBe('context_overflow');
  });

  it('classifica erro de contexto em português', () => {
    expect(classifyLlmError(new Error('O contexto máximo do modelo é 8192 tokens e você solicitou 9000'))).toBe('context_overflow');
    expect(classifyLlmError(new Error('contexto excedido'))).toBe('context_overflow');
  });

  it('classifica HTTP 400 com corpo de contexto', () => {
    expect(classifyLlmError(new Error('400 Bad Request: maximum context length exceeded'))).toBe('context_overflow');
  });

  it('classifica o erro de contexto do LM Studio (n_ctx / n_keep)', () => {
    const msg = '400 "The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 8027>= n_ctx: 4096). Try to load the model with a larger context length, or provide a shorter input."';
    expect(classifyLlmError(new Error(msg))).toBe('context_overflow');
  });

  it('classifica erro 413 no formato axios (status code)', () => {
    expect(classifyLlmError(new Error('Request failed with status code 413'))).toBe('context_overflow');
  });

  it('classifica rate limit', () => {
    expect(classifyLlmError(new Error('rate limit reached for model'))).toBe('rate_limit');
    expect(classifyLlmError(new Error('429 Too Many Requests'))).toBe('rate_limit');
  });

  it('classifica erro de servidor', () => {
    expect(classifyLlmError(new Error('500 Internal Server Error'))).toBe('server_error');
    expect(classifyLlmError(new Error('503 Service Unavailable'))).toBe('server_error');
  });

  it('classifica erro de JSON esperado', () => {
    expect(classifyLlmError(new Error('expected json object'))).toBe('json_expected');
  });

  it('retorna unknown para erros não relacionados', () => {
    expect(classifyLlmError(new Error('connection reset'))).toBe('unknown');
    expect(classifyLlmError(undefined)).toBe('unknown');
    expect(classifyLlmError('timeout')).toBe('unknown');
  });

  it('trata mensagens em maiúsculas', () => {
    expect(classifyLlmError(new Error('MAXIMUM CONTEXT LENGTH EXCEEDED'))).toBe('context_overflow');
  });
});
