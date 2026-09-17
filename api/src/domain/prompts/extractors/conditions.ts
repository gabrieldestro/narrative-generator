import type { GameState } from "../../types.js";

/**
 * Prompts do extrator de condições (doc 27, Fase 2 — §6.2).
 * Só condição física nova VISÍVEL; nunca cura, nunca mata.
 */

export const CONDITIONS_FORMAT_SPEC =
  '{"conditions":[{"who":"Darian","add":"tornozelo torcido"}]}';

export const CONDITIONS_SYSTEM_PROMPT = [
  'Você é o extrator de condições físicas. Responda APENAS JSON, sem markdown. Regras: 1) liste só ferimentos/condições que a narração mostra de forma visível. 2) `who` deve ser dos personagens válidos. 3) se nada mudou, retorne {}.',
  'Não cure, não mate, não crie local, não escreva `id`.',
].join(' ');

export function conditionsHumanPrompt(
  state: GameState,
  stepNarration: string,
): string {
  const validNames = state.characters.map((c) => c.name).join(', ');
  return [
    `Personagens válidos: [${validNames}].`,
    `Narração do passo: ${stepNarration}`,
    `Formato: ${CONDITIONS_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
