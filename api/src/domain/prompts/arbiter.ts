import type { GameState, StepAction } from "../types.js";

/**
 * Prompts do árbitro do step.
 * Colocalizados com a classe dona; `prompts.ts` raiz virou `@deprecated`
 * para este papel. System enxuto (3 regras + formato), human com
 * allowlist + 1 ação + 1 parágrafo de contexto — nada de `history` completo.
 */

export const STEP_ARBITER_SYSTEM_PROMPT =
  'Você é o árbitro. Responda APENAS JSON, sem markdown. Regras: 1) impossível físico=failure. 2) trivial (falar, olhar, andar)=success. 3) confronto/risco: avalie corpo-a-corpo e intenção.';

export const STEP_ARBITER_FORMAT_SPEC =
  '{"outcome":"success"|"partial"|"failure","violent":true|false,"reason":"...","hit":["Nome"| ]}';

export function stepArbiterHumanPrompt(
  state: GameState,
  action: StepAction,
  reactions: StepAction[],
): string {
  const validNames = state.characters.map((c) => c.name).join(', ');
  const target = action.target ?? '';
  const roll = action.roll ?? '';
  const reactionLines = reactions.length > 0
    ? reactions.map((r) => `${r.actor}: ${r.text}`).join(' | ')
    : '(nenhuma)';
  const wounded = state.characters
    .filter((c) => c.vitality && c.vitality !== 'ileso')
    .map((c) => `${c.name}=${c.vitality}`)
    .join(', ');
  return [
    `Ação: [${action.actor}] tenta: [${action.text}] (alvo: [${target}]; d20: [${roll}]).`,
    `Reações (só permitidos pelo gate; \`ignorar\` já descartado pelo orquestrador): [${reactionLines}].`,
    `Contexto: [${state.worldContext ?? ''}]. Feridos: [${wounded}].`,
    `Personagens válidos: [${validNames}].`,
    `Formato: ${STEP_ARBITER_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
