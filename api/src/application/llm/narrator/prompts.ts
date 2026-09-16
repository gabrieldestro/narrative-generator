import type { GameState, StepResolution } from "../../../domain/types.js";

/**
 * Prompts do narrador do step.
 * Colocalizados com a classe dona. Detalhe de estilo
 * (`narrativeStyle/writingStyle`) só vive aqui, nunca no árbitro/extratores.
 */

export function stepNarratorSystemPrompt(state: GameState, narrationSizePrompt: string): string {
  return [
    `Você é o Narrador Literário de um RPG do gênero: ${state.narrativeStyle} e estilo de escrita/tom: ${state.writingStyle}.`,
    'NUNCA contradiga o Árbitro. Se o Árbitro disse que falhou, narre a falha.',
    'Escreva 1-2 parágrafos em português, no presente ou pretérito imperfeito, só sobre este fato.',
    narrationSizePrompt,
  ].join('\n');
}

export function stepNarratorHumanPrompt(
  actionLine: string,
  resolution: StepResolution,
  unexpected = false,
): string {
  const parts = [
    `Ação: ${actionLine}`,
    `Desfecho decidido (cumpra, não recite): ${resolution.outcome}${resolution.violent ? ', com confronto físico' : ''} — ${resolution.reason}.`,
  ];
  // `unexpectedEvent` (1x/turno) entra no narrador do 1º step.
  if (unexpected) {
    parts.push('Intervenção do destino: um acontecimento totalmente inesperado DEVE surgir nesta cena, integrado ao tom.');
  }
  parts.push('Escreva apenas o texto da narração do step (1-2 parágrafos):');
  return parts.join('\n');
}
