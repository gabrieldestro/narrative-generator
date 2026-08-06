import { describe, it, expect } from 'vitest';
import {
  describeSceneSystemPrompt,
  describeSceneHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
} from '../../prompts.js';
import { DEFAULT_SETTINGS, DEFAULT_NARRATION_SIZE_PROMPTS } from '../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

const NARRATION_SIZE_PROMPT = DEFAULT_NARRATION_SIZE_PROMPTS[DEFAULT_SETTINGS.narrationSize];

describeIf('Descrição de Cenário — separação entre cenário e narração (LLM real)', () => {
  it('deve gerar uma descrição do local quando o jogador entra em um novo local', async () => {
    const state = buildState({
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      worldContext: 'Uma vila sombria no sopé da montanha, cercada por pinheiros e neblina.',
      characters: [
        { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna do Viajante' },
      ],
    });

    const response = await invokeLlm(
      describeSceneSystemPrompt(state),
      describeSceneHumanPrompt(state, 'Taverna do Viajante'),
    );
    await saveOutput('scene-description', 'descricao-novo-local', response);

    expect(response.length).toBeGreaterThan(20);
    // Deve descrever o ambiente, não ações
    expect(response.toLowerCase()).not.toContain('tenta');
    expect(response.toLowerCase()).not.toContain('o jogador faz');
  }, 180000);

  it('deve manter a narração sem redescrever o cenário quando o local já foi estabelecido', async () => {
    const state = buildState({
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      worldContext: 'O salão do castelo está iluminado por tochas e tapetes vermelhos.',
      characters: [
        { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Salão do Castelo' },
      ],
      history: ['Turno 1: Você chegou ao salão iluminado por tochas.'],
      turnNumber: 2,
    });
    const actions = ['Aric tenta: Examinar o trono (Resultado do dado d20: 15)'];
    const arbiterResolution = 'Aric tentou examinar -> Sucesso porque encontrou um selo real.';

    const response = await invokeLlm(
      narratorSystemPrompt(state, NARRATION_SIZE_PROMPT),
      narratorHumanPrompt(state, actions, arbiterResolution),
    );
    await saveOutput('scene-description', 'narracao-sem-redescricao', response);

    expect(response.length).toBeGreaterThan(20);
    // O narrador foi instruído a não reintroduzir o cenário: não deve recomeçar
    // descrevendo o local como se fosse novo.
    expect(response.toLowerCase()).not.toContain('você entra no salão');
    expect(response.toLowerCase()).not.toContain('você chega ao salão');
  }, 180000);

  it('deve concatenar descrição de cenário + narração no resultado final', async () => {
    const state = buildState({
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      worldContext: 'Um corredor escuro coberto de tapeçarias rasgadas.',
      characters: [
        { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Corredor das Tapeçarias' },
      ],
      history: [],
      turnNumber: 1,
    });

    const sceneDescription = await invokeLlm(
      describeSceneSystemPrompt(state),
      describeSceneHumanPrompt(state, 'Corredor das Tapeçarias'),
    );
    await saveOutput('scene-description', '1-cenario', sceneDescription);
    expect(sceneDescription.length).toBeGreaterThan(20);

    const actions = ['Aric tenta: Atravessar o corredor (Resultado do dado d20: 12)'];
    const arbiterResolution = 'Aric tentou atravessar -> Sucesso.';

    const narration = await invokeLlm(
      narratorSystemPrompt(state, NARRATION_SIZE_PROMPT),
      narratorHumanPrompt(state, actions, arbiterResolution),
    );
    await saveOutput('scene-description', '2-narracao', narration);

    const combined = `${sceneDescription}\n\n${narration}`;
    await saveOutput('scene-description', '3-combinado', combined);

    expect(combined.startsWith(sceneDescription)).toBe(true);
    expect(combined).toContain(narration);
    expect(combined.length).toBeGreaterThan(40);
  }, 180000);
});
