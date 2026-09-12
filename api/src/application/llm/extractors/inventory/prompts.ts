import type { GameState } from "../../../../domain/types.js";

/**
 * Prompts do extrator de inventário (doc 27, Fase 2 — §6.2).
 * Colocalizado com a classe dona. Só pegar/largar item; sem local novo,
 * sem morte/cura, sem `id`.
 */

export const INVENTORY_FORMAT_SPEC =
  '{"grab":[{"who":"Elara","item":"Chave de Bronze"}],"drop":[]}';

export const INVENTORY_SYSTEM_PROMPT = [
  'Você é o extrator de inventário. Responda APENAS JSON, sem markdown. Regras: 1) liste só itens que a narração diz que foram pegos ou largados. 2) `who` deve ser da lista de personagens válidos. 3) se nada mudou, retorne {}.',
  'Não crie local novo, não mate, não cure, não escreva `id`.',
].join(' ');

export function inventoryHumanPrompt(
  state: GameState,
  microNarration: string,
): string {
  const validNames = state.characters.map((c) => c.name).join(', ');
  return [
    `Personagens válidos: [${validNames}].`,
    `Micro-narração: ${microNarration}`,
    `Formato: ${INVENTORY_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
