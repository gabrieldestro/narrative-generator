import { describe, it, expect } from 'vitest';
import {
  cpuReflectionSystemPrompt,
  cpuReflectionHumanPrompt,
} from '../../CpuAgentPrompts.js';
import type { Character } from '../../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from '../../../__tests__/integration/helpers.js';

describeIf('CPU Agent Reflection com LLM real (LM Studio)', () => {
  it('deve retornar JSON válido com reasoning, updatedObjective e action para Cyberpunk', async () => {
    const state = buildState();
    const npc: Character = {
      id: '2',
      name: 'Ghost',
      description: 'Uma netrunner com cabelo roxo neon, implantes neurais obsoletos e um senso de humor ácido.',
      personality: 'Furtiva, desconfiada, sarcástica.',
      isPlayer: false,
      longTermObjective: 'Infiltrar o sistema central da Arasaka para copiar dados incriminatórios.',
      currentObjective: 'Infiltrar o sistema central da Arasaka para copiar dados incriminatórios.',
      scratchpad: [],
    };

    const response = await invokeLlm(
      cpuReflectionSystemPrompt(state, npc),
      cpuReflectionHumanPrompt(state),
    );
    await saveOutput('cpu-agent', '1-reflection-cyberpunk', response);

    let parsed: any;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Tentar parse direto
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(typeof parsed.reasoning).toBe('string');
    expect(parsed.reasoning.length).toBeGreaterThan(10);
    expect(typeof parsed.updatedObjective).toBe('string');
    expect(parsed.updatedObjective.length).toBeGreaterThan(5);
    expect(typeof parsed.action).toBe('string');
    expect(parsed.action.length).toBeGreaterThan(10);
  }, 180000);

  it('deve retornar JSON válido para Fantasia com scratchpad preenchido', async () => {
    const state = buildState({
      worldContext: 'O reino de Aetheria está de luto. O rei Aldric jaz morto, envenenado em seu próprio banquete.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
    });

    const npc: Character = {
      id: '2',
      name: 'Elara',
      description: 'Uma elfa da floresta com uma capa de couro desgastada e um arco longo esculpido em madeira prateada.',
      personality: 'Sábia, furtiva, desconfiada de estranhos.',
      isPlayer: false,
      longTermObjective: 'Descobrir quem envenenou o rei e levar o assassino à justiça.',
      currentObjective: 'Examinar a taça de vinho do rei em busca de vestígios de veneno.',
      scratchpad: [
        { turn: 1, objective: 'Examinar a taça', action: 'Cheirar o vinho', result: 'success', reasoning: 'Identifiquei um odor amargo de cianeto.' },
        { turn: 2, objective: 'Encontrar o assassino', action: 'Perguntar aos serviçais', result: 'failure', reasoning: 'Os serviçais estão amedrontados demais para falar.' },
      ],
    };

    const response = await invokeLlm(
      cpuReflectionSystemPrompt(state, npc),
      cpuReflectionHumanPrompt(state),
    );
    await saveOutput('cpu-agent', '2-reflection-fantasia', response);

    let parsed: any;
    const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    parsed = JSON.parse(cleaned);

    expect(parsed.reasoning.length).toBeGreaterThan(10);
    expect(parsed.updatedObjective.length).toBeGreaterThan(5);
    expect(parsed.action.length).toBeGreaterThan(10);
    // O reasoning deve refletir o scratchpad (falha ao perguntar)
    expect(parsed.reasoning.toLowerCase()).toMatch(/serviçal|servical|pergunt|medo/);
  }, 180000);
});
