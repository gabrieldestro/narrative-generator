import { describe, it, expect } from 'vitest';
import {
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../../prompts.js';
import { MAX_NARRATION_TOKENS } from '../../LlmService.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

const CHARS_PER_TOKEN = 4;
const MAX_NARRATION_CHARS = MAX_NARRATION_TOKENS * CHARS_PER_TOKEN;
// MAX_NARRATION_TOKENS = 150 → MAX_NARRATION_CHARS = 600

describeIf('Narração — limite de tokens (MAX_NARRATION_TOKENS)', () => {
  it('deve respeitar o limite de MAX_NARRATION_TOKENS quando maxTokens é passado', async () => {
    const state = buildState();
    const actions = [
      'Kael tenta: Investigar a mesa ao lado (Resultado do dado d20: 15)',
      'Ghost tenta: Hackear o terminal de segurança (Resultado do dado d20: 7)',
    ];
    const arbiterResolution = 'Kael tentou investigar -> Sucesso porque encontrou um chip de dados. Ghost tentou hackear -> Falha porque o firewall foi atualizado.';

    const response = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResolution),
      MAX_NARRATION_TOKENS,
    );
    await saveOutput('narration-token-limit', 'response', response);

    expect(response.length).toBeGreaterThan(10);
    expect(response.length).toBeLessThanOrEqual(MAX_NARRATION_CHARS);
  }, 180000);

  it('deve respeitar o limite com contexto de terror e evento inesperado', async () => {
    const state = buildState({
      worldContext: 'O Asilo Blackwood está abandonado há 40 anos. Sua lanterna pisca no corredor úmido.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
    });
    const actions = [
      'Elias tenta: Apontar a lanterna para o corredor escuro (Resultado do dado d20: 12)',
      'Marcus tenta: Examinar as marcas de garras na parede (Resultado do dado d20: 18)',
    ];
    const arbiterResolution = 'Elias apontou a lanterna -> Sucesso. Marcus examinou as marcas -> Sucesso pois identificou padrão de ataque.';

    const response = await invokeLlm(
      narratorSystemPrompt(state, true),
      narratorHumanPrompt(state, actions, arbiterResolution),
      MAX_NARRATION_TOKENS,
    );
    await saveOutput('narration-token-limit', 'response-terror', response);

    expect(response.length).toBeGreaterThan(10);
    expect(response.length).toBeLessThanOrEqual(MAX_NARRATION_CHARS);
  }, 180000);
});
