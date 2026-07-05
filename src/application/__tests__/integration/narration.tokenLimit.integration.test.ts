import { describe, it, expect } from 'vitest';
import {
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../../prompts.js';
import { DEFAULT_SETTINGS, DEFAULT_NARRATION_SIZE_PROMPTS } from '../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

const NARRATION_SIZE_PROMPT = DEFAULT_NARRATION_SIZE_PROMPTS[DEFAULT_SETTINGS.narrationSize];

describeIf('Narração — controle de tamanho via prompt', () => {
  it('deve gerar narração coerente com o prompt balanced', async () => {
    const state = buildState();
    const actions = [
      'Kael tenta: Investigar a mesa ao lado (Resultado do dado d20: 15)',
      'Ghost tenta: Hackear o terminal de segurança (Resultado do dado d20: 7)',
    ];
    const arbiterResolution = 'Kael tentou investigar -> Sucesso porque encontrou um chip de dados. Ghost tentou hackear -> Falha porque o firewall foi atualizado.';

    const response = await invokeLlm(
      narratorSystemPrompt(state, NARRATION_SIZE_PROMPT),
      narratorHumanPrompt(state, actions, arbiterResolution),
    );
    await saveOutput('narration-size', 'response-balanced', response);

    expect(response.length).toBeGreaterThan(10);
  }, 180000);

  it('deve gerar narração coerente com contexto de terror', async () => {
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
      narratorSystemPrompt(state, NARRATION_SIZE_PROMPT, true),
      narratorHumanPrompt(state, actions, arbiterResolution),
    );
    await saveOutput('narration-size', 'response-terror', response);

    expect(response.length).toBeGreaterThan(10);
  }, 180000);
});
