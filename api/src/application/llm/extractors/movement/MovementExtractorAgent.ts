import type { GameState, MovementDelta } from "../../../../domain/types.js";
import type { LlmClient } from "../../LlmClient.js";
import type { IStructuredResolver } from "../../StructuredResolver.js";
import { validateMovementDelta, normalizeMovementDelta } from "../../../selfHealing/JsonValidators.js";
import { normalizeForGrounding } from "../../../utils/grounding.js";
import { ExtractorBase } from "../ExtractorBase.js";
import {
  MOVEMENT_FORMAT_SPEC,
  MOVEMENT_SYSTEM_PROMPT,
  movementHumanPrompt,
} from "./prompts.js";

/**
 * Extrator de movimento (doc 27, Fase 2 — §6.2/§7.2).
 * Pré-filtro: verbo de movimento OU nome de local válido na narração.
 * Move para nome desconhecido NÃO aplica aqui (vira `pendingMoves`).
 */
export class MovementExtractorAgent extends ExtractorBase<MovementDelta> {
  readonly formatSpec = MOVEMENT_FORMAT_SPEC;
  readonly temperature = 0.0;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
  ) {
    super();
  }

  hasSignal(narration: string): boolean {
    if (/v[ao]i|foi|corre|segu[ei]|caminh|atravess|entr[ao]|saiu?|cheg|partiu?|retorn|volto?u?|desc[ei]|sub[ei]|moveu?-?se|desloc|fugiu?|avanç|entr[oa]r/i.test(narration)) {
      return true;
    }
    return false;
  }

  /** Sinal por local conhecido — precisa do estado (nomes de locais). */
  hasLocationSignal(state: GameState, narration: string): boolean {
    const haystack = normalizeForGrounding(narration);
    return (state.locations ?? []).some((l) => haystack.includes(normalizeForGrounding(l.name)));
  }

  validate(value: unknown): value is MovementDelta {
    return validateMovementDelta(value);
  }

  async extract(state: GameState, microNarration: string): Promise<MovementDelta> {
    if (!this.hasSignal(microNarration) && !this.hasLocationSignal(state, microNarration)) return {};
    const healed = await this.resolver.resolveJson({
      agent: 'Extrator:Movimento',
      turn: state.turnNumber,
      system: MOVEMENT_SYSTEM_PROMPT,
      human: movementHumanPrompt(state, microNarration),
      schemaSpec: this.formatSpec,
      validate: validateMovementDelta,
      compact: true,
    });
    if (!healed) return {};
    return normalizeMovementDelta(healed.value);
  }

  getClient(): LlmClient {
    return this.client;
  }
}
