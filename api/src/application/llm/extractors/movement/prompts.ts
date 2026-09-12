import type { GameState } from "../../../../domain/types.js";

/**
 * Prompts do extrator de movimento (doc 27, Fase 2 — §6.2).
 * Só deslocamento entre locais EXISTENTES; nome desconhecido não é criado
 * aqui (vai para `pendingMoves` na fusão — cena-extrator na Fase 4).
 */

export const MOVEMENT_FORMAT_SPEC =
  '{"move":[{"who":"Elara","to":"Porão"}]}';

export const MOVEMENT_SYSTEM_PROMPT = [
  'Você é o extrator de movimento. Responda APENAS JSON, sem markdown. Regras: 1) liste só deslocamentos que a narração diz que aconteceram. 2) `who` deve ser dos personagens válidos, `to` dos locais válidos. 3) se nada mudou, retorne {}.',
  'Não crie local novo, não mate, não cure, não escreva `id`.',
].join(' ');

export function movementHumanPrompt(
  state: GameState,
  microNarration: string,
): string {
  const validNames = state.characters.map((c) => c.name).join(', ');
  const validPlaces = (state.locations ?? []).map((l) => l.name).join(', ');
  return [
    `Personagens válidos: [${validNames}].`,
    `Locais válidos: [${validPlaces}].`,
    `Micro-narração: ${microNarration}`,
    `Formato: ${MOVEMENT_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
