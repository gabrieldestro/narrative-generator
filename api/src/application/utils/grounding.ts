/**
 * Grounding determinístico (doc 27, Fase 0 — §3 "Grounding obrigatório").
 *
 * Fase 0: util + `warn` no legado. Enforcement estrito (descarte) só na
 * Fase 2, nos micro-extratores — o teste legado
 * (`GameManagementService.test.ts`) prova que filtro full-string quebraria
 * o comportamento atual (`"Chave de Bronze"` vs narração `"uma chave"`).
 */

/** Normaliza para comparação: minúsculas + strip de diacríticos. */
export function normalizeForGrounding(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Tokens significativos: palavras com 4+ letras (ignora "de/da/do/e/o/a"). */
export function significantTokens(term: string): string[] {
  return normalizeForGrounding(term)
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 4);
}

/**
 * Retorna true se o termo está "grounded" na narração.
 * Critério leniente da Fase 0: TODOS os tokens significativos do termo
 * aparecem na narração normalizada (substring). Termo vazio → false.
 */
export function isGroundedTerm(term: string, narration: string): boolean {
  if (!term || !term.trim() || !narration) return false;
  const haystack = normalizeForGrounding(narration);
  const tokens = significantTokens(term);
  if (tokens.length === 0) {
    // Termo sem token significativo (ex: "pó") — cai para substring direta.
    return haystack.includes(normalizeForGrounding(term));
  }
  return tokens.every((t) => haystack.includes(t));
}
