import { describe, it, expect } from 'vitest';
import {
  narrateSystemPrompt,
  narrateHumanPrompt,
} from '../../prompts.js';
import { DEFAULT_SETTINGS, DEFAULT_NARRATION_SIZE_PROMPTS } from '../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

const NARRATION_SIZE_PROMPT = DEFAULT_NARRATION_SIZE_PROMPTS[DEFAULT_SETTINGS.narrationSize];

describeIf('Narração Declarada com LLM real (LM Studio)', () => {
  it('deve narrar respeitando fielmente a declaração do jogador', async () => {
    const state = buildState({
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      worldContext: 'Uma taverna escura na encruzilhada dos reinos, com um balcão de madeira gasto e um fogo crepitante.',
      characters: [
        { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna do Viajante' },
      ],
      history: [
        'Turno 1: Aric entrou na taverna e sentou perto do balcão.',
      ],
      turnNumber: 2,
    });

    const declaration = 'Aric se levanta, atravessa a taverna e empurra a pesada porta de carvalho, que range ao se abrir para um corredor escuro.';
    const response = await invokeLlm(
      narrateSystemPrompt(state, NARRATION_SIZE_PROMPT),
      narrateHumanPrompt(state, declaration, 'Aric'),
    );
    await saveOutput('narracao', '1-porta-carvalho', response);

    expect(response.length).toBeGreaterThan(20);
    // Deve cumprir a declaração: a porta foi empurrada e se abriu
    const lower = response.toLowerCase();
    expect(lower).toMatch(/abri|corredor escuro|porta/);
    expect(lower).not.toContain('o jogador faz');
  }, 180000);

  it('deve narrar uma consequência declarada de objeto (apagar a lareira) sem contradizer', async () => {
    const state = buildState({
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
      worldContext: 'A sala de estar da mansão mal-assombrada, com uma lareira acesa crepitando.',
      characters: [
        { id: '1', name: 'Elias', description: 'Jornalista', personality: 'Curioso', isPlayer: true, currentLocation: 'Sala de Estar' },
      ],
      history: [
        'Turno 1: Elias observa as sombras dançarem nas paredes iluminadas pela lareira.',
      ],
      turnNumber: 2,
    });

    const declaration = 'O fogo da lareira se apaga de repente, mergulhando a sala na escuridão total.';
    const response = await invokeLlm(
      narrateSystemPrompt(state, NARRATION_SIZE_PROMPT),
      narrateHumanPrompt(state, declaration, 'Elias'),
    );
    await saveOutput('narracao', '2-lareira-apagada', response);

    expect(response.length).toBeGreaterThan(20);
    // O fogo deve estar apagado: a consequência declarada é mantida
    const lower = response.toLowerCase();
    expect(lower).toMatch(/apag|escuro|escurid|treva/);
    expect(lower).not.toContain('o fogo continua aceso');
  }, 180000);
});