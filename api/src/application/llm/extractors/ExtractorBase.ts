import type { GameState } from "../../../domain/types.js";
import { isGroundedTerm } from "../../utils/grounding.js";

/**
 * Base dos extratores por categoria (validação de forma + grounding
 * determinística: termo precisa aparecer na narração do step).
 * Esqueleto compartilhado — `hasSignal()` (pré-filtro sem LLM,
 * o extrator nem é chamado sem sinal) + `isGrounded()` (barreira
 * determinística).
 * Os agentes concretos (`Inventory/Movement/Conditions/Scene`) têm
 * prompt + validador + `extract()` próprios.
 */
export abstract class ExtractorBase<TDelta> {
  /** Pré-filtro sem LLM: há sinal desta categoria na narração? */
  abstract hasSignal(narration: string): boolean;

  /** Validador puro da categoria (descarta a ENTRADA inválida, não o objeto). */
  abstract validate(value: unknown): value is TDelta;

  /** Formato esperado (vai para o prompt e para o repair). */
  abstract readonly formatSpec: string;

  protected isGrounded(term: string, narration: string): boolean {
    return isGroundedTerm(term, narration);
  }

  protected knownNames(state: GameState): Set<string> {
    return new Set(state.characters.map((c) => c.name.toLowerCase()));
  }

  protected knownLocations(state: GameState): Set<string> {
    return new Set((state.locations ?? []).map((l) => l.name.toLowerCase()));
  }
}
