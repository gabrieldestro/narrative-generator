import { describe, it, expect } from 'vitest';
import {
  arbiterSystemPrompt,
  arbiterHumanPrompt,
} from '../../prompts.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

describeIf('Árbitro: ações fora do tema não são negadas por estilo/gênero', () => {
  it('deve aprovar ação fora do tema em Terror Sombrio porque o personagem é capaz de executá-la', async () => {
    const state = buildState({
      worldContext: 'O Asilo Blackwood está abandonado há 40 anos. Você está no porão com uma lanterna fraca. Sons de arranhões vêm de dentro das paredes.',
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
    });
    const actions = [
      'Elias tenta: Contar uma piada alta para aliviar a tensão.',
      'Elias tenta: Assobiar uma música alegre enquanto caminha pelo corredor.',
    ];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('fora-do-tema-terror', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const linhas = arbiterResponse.toLowerCase();
    expect(linhas).toContain('sucesso');
    const contemFalha = linhas.includes('falha');
    const motivosEstilo = [
      'gênero', 'estilo', 'tom', 'tema', 'atmosfera',
      'não condiz', 'inapropriado', 'fora do tema', 'fora do estilo',
      'quebra a imersão', 'não combina', 'desrespeita',
    ];
    const rejeitouPorEstilo = motivosEstilo.some((palavra) => linhas.includes(palavra));
    expect(rejeitouPorEstilo).toBe(false);
    if (contemFalha) {
      expect(linhas).not.toMatch(/falha.*(gênero|estilo|tom|tema|atmosfera)/i);
    }
  }, 60000);

  it('deve aprovar ação fora do tema em Fantasia Medieval Épica', async () => {
    const state = buildState({
      worldContext: 'O castelo do rei Aldric. Cavaleiros e nobres observam o banquete real no grande salão.',
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
    });
    const actions = [
      'Darian tenta: Soltar uma gargalhada alta no meio do discurso do rei.',
      'Darian tenta: Assobiar uma música pop moderninha.',
    ];

    const arbiterResponse = await invokeLlm(
      arbiterSystemPrompt,
      arbiterHumanPrompt(state, actions)
    );
    await saveOutput('fora-do-tema-fantasia', '2-arbiter', arbiterResponse);
    expect(arbiterResponse.length).toBeGreaterThan(10);

    const linhas = arbiterResponse.toLowerCase();
    expect(linhas).toContain('sucesso');
    const motivosEstilo = [
      'gênero', 'estilo', 'tom', 'tema', 'atmosfera',
      'fora do tema', 'fora do estilo', 'não condiz',
      'quebra a imersão', 'não combina', 'anacrônico',
    ];
    const rejeitouPorEstilo = motivosEstilo.some((palavra) => linhas.includes(palavra));
    expect(rejeitouPorEstilo).toBe(false);
  }, 60000);
});
