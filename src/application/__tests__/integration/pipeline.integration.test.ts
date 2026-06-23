import { describe, it, expect } from 'vitest';
import {
  cpuActionSystemPrompt,
  cpuActionHumanPrompt,
  arbiterSystemPrompt,
  arbiterHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../../prompts.js';
import type { Character } from '../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

describeIf('Pipeline Multi-Agente com LLM real (LM Studio)', () => {
  it('deve executar o pipeline NPC → Árbitro → Narrador para Cyberpunk', async () => {
    const state = buildState();
    const npc: Character = {
      id: '2',
      name: 'Ghost',
      description: 'Uma netrunner com cabelo roxo neon, implantes neurais obsoletos e um senso de humor ácido.',
      personality: 'Furtiva, desconfiada, sarcástica.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('cyberpunk', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Kael tenta: Investigar a mesa ao lado.`, `Ghost tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('cyberpunk', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('cyberpunk', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);

  it('deve executar o pipeline NPC → Árbitro → Narrador para Fantasia Medieval', async () => {
    const state = buildState({
      worldContext: 'O reino de Aetheria está de luto. O rei Aldric jaz morto, envenenado em seu próprio banquete. Você e Elara são os únicos que suspeitam do vizir.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
    });
    const npc: Character = {
      id: '2',
      name: 'Elara',
      description: 'Uma elfa da floresta com uma capa de couro desgastada e um arco longo esculpido em madeira prateada.',
      personality: 'Furtiva, sábia, leal.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('fantasia', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Darian tenta: Examinar a taça de vinho do rei.`, `Elara tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('fantasia', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('fantasia', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);

  it('deve executar o pipeline NPC → Árbitro → Narrador para Terror', async () => {
    const state = buildState({
      worldContext: 'O Asilo Blackwood está abandonado há 40 anos. Os locais dizem que os pacientes nunca foram embora. Sua lanterna pisca no corredor úmido.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
    });
    const npc: Character = {
      id: '2',
      name: 'Marcus',
      description: 'Um ex-detetive policial com a mão trêmula e uma garrafa de uísque no bolso do casaco. Ele sabe algo que não está contando.',
      personality: 'Cínico, traumatizado, relutante.',
      isPlayer: false,
    };

    const npxResponse = await invokeLlm(
      cpuActionSystemPrompt(state, npc),
      cpuActionHumanPrompt(state)
    );
    await saveOutput('terror', '1-npc', npxResponse);
    expect(npxResponse.length).toBeGreaterThan(10);
    const actions = [`Elias tenta: Apontar a lanterna para o corredor escuro.`, `Marcus tenta: ${npxResponse}`];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('terror', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const narratorResponse = await invokeLlm(
      narratorSystemPrompt(state),
      narratorHumanPrompt(state, actions, arbiterResponse)
    );
    await saveOutput('terror', '3-narrator', narratorResponse);
    expect(narratorResponse.length).toBeGreaterThan(50);
  }, 60000);
});
