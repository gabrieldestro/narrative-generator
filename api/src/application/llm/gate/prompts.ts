import type { GateCandidate, MicroAction } from "../../../domain/types.js";

/**
 * Prompts do árbitro de percepção (doc 27, Fase 3 — §6.5).
 * Entrada magra de propósito: ação + roster + flags. SEM events/history/
 * factSheet/threads — o gate julga física, não segredo (anti-metagaming).
 */

export const GATE_FORMAT_SPEC =
  '{"rulings":[{"who":"...","allow":true|false,"channel":"saw"|"heard"|"stake"|"none","why":"..."}]}';

export const GATE_SYSTEM_PROMPT = [
  'Você é o árbitro de percepção. Responda APENAS JSON, sem markdown.',
  'Regras: 1) mesmo local viu (saw), salvo ação furtiva explícita. 2) outra sala só ouviu (heard) se a ação for ruidosa/violenta pelo próprio texto (grito, explosão, queda, combate) — sussurro/gesto/furto = negado (none). 3) alvo/dono do afetado = stake, independente de distância.',
].join(' ');

export function gateHumanPrompt(
  action: MicroAction,
  actorWhere: string,
  candidates: GateCandidate[],
): string {
  const roster = candidates
    .map((c) => `[${c.name}|${c.where}|target=${c.isTarget},ownsItem=${c.ownsItem}]`)
    .join(' ');
  return [
    `Ação: [${action.actor}] tenta: [${action.text}] (onde: [${actorWhere}]).`,
    `Candidatos: ${roster || '(nenhum)'}.`,
    `Formato: ${GATE_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
