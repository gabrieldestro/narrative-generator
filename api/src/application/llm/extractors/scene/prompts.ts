import type { GameState } from "../../../../domain/types.js";

/**
 * Prompts do cena-extrator (doc 27, Fase 4 — §6.3).
 * Roda 1x por turno (fim de cena): locais/NPCs novos, morte/perda e cura
 * narrativa explícita. Nunca aceita `id` do LLM (engine slugifica).
 */

export const SCENE_FORMAT_SPEC =
  '{"new_locations":[{"name":"Sótão","desc":"..."}],"new_npcs":[{"name":"Vulto","desc":"...","where":"Sótão"}],"dead":[],"lost":[],"healed":[]}';

export const SCENE_SYSTEM_PROMPT = [
  'Você é o extrator de cena. Responda APENAS JSON, sem markdown. Regras: 1) liste só o que a narração consolidada mostra de forma explícita. 2) `dead`/`lost` só se a prosa diz explicitamente (morreu, sumiu); caído não é morto. 3) `healed` só para cura narrativa explícita. 4) se nada mudou, retorne {}.',
  'Nunca escreva `id`. Nomes em português, como aparecem na narração.',
].join(' ');

export function sceneHumanPrompt(
  state: GameState,
  sceneNarration: string,
): string {
  const knownPlaces = (state.locations ?? []).map((l) => l.name).join(', ');
  const knownNames = state.characters.map((c) => c.name).join(', ');
  return [
    `Locais conhecidos: [${knownPlaces}].`,
    `Personagens conhecidos: [${knownNames}].`,
    `Narração da cena:\n${sceneNarration}`,
    `Formato: ${SCENE_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
