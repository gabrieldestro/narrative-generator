import type { GameState, InventoryDelta } from "../../../../domain/types.js";
import type { LlmClient } from "../../LlmClient.js";
import type { IStructuredResolver } from "../../StructuredResolver.js";
import { validateInventoryDelta, normalizeInventoryDelta } from "../../../selfHealing/JsonValidators.js";
import { ExtractorBase } from "../ExtractorBase.js";
import {
  INVENTORY_FORMAT_SPEC,
  INVENTORY_SYSTEM_PROMPT,
  inventoryHumanPrompt,
} from "./prompts.js";

/**
 * Extrator de inventário (doc 27, Fase 2 — §6.2/§7.2).
 * Só roda o LLM com sinal (`hasSignal`); grounding estrito + allowlist de
 * nomes vivem na fusão (`GameManagementService.applyMicroUpdates`).
 */
export class InventoryExtractorAgent extends ExtractorBase<InventoryDelta> {
  readonly formatSpec = INVENTORY_FORMAT_SPEC;
  /** Temp por função (§3): extratores `0.0-0.2` (mesma ressalva de factory do árbitro). */
  readonly temperature = 0.0;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
  ) {
    super();
  }

  hasSignal(narration: string): boolean {
    return /peg[ao]u?|larg|guard|entreg|invent[áa]rio|mochila|bols[ao]|empunh|equip|item/i.test(narration);
  }

  validate(value: unknown): value is InventoryDelta {
    return validateInventoryDelta(value);
  }

  async extract(state: GameState, microNarration: string): Promise<InventoryDelta> {
    if (!this.hasSignal(microNarration)) return {};
    const healed = await this.resolver.resolveJson({
      agent: 'Extrator:Inventário',
      turn: state.turnNumber,
      system: INVENTORY_SYSTEM_PROMPT,
      human: inventoryHumanPrompt(state, microNarration),
      schemaSpec: this.formatSpec,
      validate: validateInventoryDelta,
      compact: true,
    });
    if (!healed) return {};
    return normalizeInventoryDelta(healed.value);
  }

  getClient(): LlmClient {
    return this.client;
  }
}
