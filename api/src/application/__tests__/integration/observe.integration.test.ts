import { describe, it, expect } from 'vitest';
import {
  observeSystemPrompt,
  observeHumanPrompt,
} from '../../prompts.js';
import { DEFAULT_SETTINGS, DEFAULT_NARRATION_SIZE_PROMPTS } from '../../../domain/types.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

const NARRATION_SIZE_PROMPT = DEFAULT_NARRATION_SIZE_PROMPTS[DEFAULT_SETTINGS.narrationSize];

describeIf('Observação de Cena com LLM real (LM Studio)', () => {
  it('deve detalhar um aspecto da cena sem avançar a história', async () => {
    const state = buildState({
      narrativeStyle: 'Fantasia Medieval',
      writingStyle: 'Épico / Poético',
      worldContext: 'Uma taverna escura na encruzilhada dos reinos, com um balcão de madeira gasto e um fogo crepitante.',
      characters: [
        { id: '1', name: 'Aric', description: 'Guerreiro', personality: 'Corajoso', isPlayer: true, currentLocation: 'Taverna do Viajante' },
      ],
      history: [
        'Turno 1: Você entrou na taverna e sentou perto do balcão, onde a madeira está cheia de marcas de punhal.',
      ],
      turnNumber: 2,
    });

    const response = await invokeLlm(
      observeSystemPrompt(state, NARRATION_SIZE_PROMPT),
      observeHumanPrompt(state, 'O que percebo de estranho nas marcas no balcão?', 'Aric'),
    );
    await saveOutput('observacao', '1-detalhe-balcao', response);

    expect(response.length).toBeGreaterThan(20);
    // A observação deve permanecer na cena: não deve narrar ações nem avançar a história
    const lower = response.toLowerCase();
    expect(lower).not.toContain('tenta');
    expect(lower).not.toContain('o jogador faz');
  }, 180000);

  it('deve ser fiel ao cenário e responder ao pedido do jogador', async () => {
    const state = buildState({
      narrativeStyle: 'Terror de Sobrevivência',
      writingStyle: 'Terror Sombrio',
      worldContext: 'O corredor do asilo Blackwood está coberto de poeira, com portas trancadas e a luz da lanterna tremulando.',
      characters: [
        { id: '1', name: 'Elias', description: 'Jornalista', personality: 'Curioso', isPlayer: true, currentLocation: 'Corredor do Asilo' },
      ],
      history: [
        'Turno 1: Você avançou pelo corredor, ouvindo apenas o ranger das tábuas sob seus pés.',
      ],
      turnNumber: 2,
    });

    const response = await invokeLlm(
      observeSystemPrompt(state, NARRATION_SIZE_PROMPT),
      observeHumanPrompt(state, 'Que sons você percebe ao redor?', 'Elias'),
    );
    await saveOutput('observacao', '2-sons-corredor', response);

    expect(response.length).toBeGreaterThan(20);
    // Deve abordar o aspecto pedido (sons) sem inventar novos eventos/chegadas —
    // aceita uma lista ampla de termos auditivos por variabilidade do modelo
    const lower = response.toLowerCase();
    const termosAuditivos = [
      'som', 'sons', 'silêncio', 'silencio', 'ranger', 'eco', 'sussurro',
      'ruído', 'ruido', 'quietude', 'vibração', 'vibracao', 'arrastar',
      'murmúrio', 'murmurio', 'passo', 'passos', 'estalo', 'tic-tac',
      'barulho', 'audível', 'audivel', 'ouvir', 'ouvido', 'abafado',
    ];
    const abordaSons = termosAuditivos.some(k => lower.includes(k));
    expect(abordaSons).toBe(true);
    expect(lower).not.toContain('tenta');
  }, 180000);
});
