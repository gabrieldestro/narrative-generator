import type { ActionEvent, FactSheet } from "../types.js";

/**
 * Prompts de memória factual (doc 27, Fase 4 — §8.1).
 * Colocalizados com a classe dona (`MemoryService`).
 */

export const FACTS_FORMAT_SPEC =
  '{"facts":["..."],"threads":[{"id":"artefato","text":"...","status":"open"}]}';

export const CONSOLIDATE_SYSTEM_PROMPT = [
  'Você é o consolidador de memória factual. Responda APENAS JSON, sem markdown. Regras: 1) substitua a ficha antiga pela nova (replace, nunca append). 2) max 10 facts de 1 frase (mantenha a redação original) e max 10 threads abertas. 3) sempre manter morte/perda, ferimento grave, local/NPC novo, ganho/perda de item, promessa/ameaça/traição; descartar ou agregar o trivial (movimento sem consequência, falha repetida vira contador).',
  'Nunca inclua o que já está em campo (vitalidade, inventário, locais, status) — é pin determinístico.',
].join(' ');

export function consolidateHumanPrompt(
  oldSheet: FactSheet | undefined,
  sceneEvents: ActionEvent[],
  sceneNarrations: string[],
): string {
  const old = oldSheet
    ? `Ficha antiga: ${JSON.stringify(oldSheet)}`
    : 'Ficha antiga: (vazia)';
  const events = sceneEvents
    .map((e) => `#${e.seq} T${e.turn} ${e.who} ${e.did} [${e.outcome}] em ${e.where}`)
    .join('\n');
  return [
    old,
    `Eventos da cena:\n${events || '(nenhum)'}`,
    `Narrações da cena:\n${sceneNarrations.join('\n\n') || '(nenhuma)'}`,
    `Formato: ${FACTS_FORMAT_SPEC}`,
    'JSON:',
  ].join('\n');
}
