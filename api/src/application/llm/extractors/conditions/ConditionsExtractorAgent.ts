import type { ConditionsDelta, GameState } from "../../../../domain/types.js";
import type { LlmClient } from "../../LlmClient.js";
import type { IStructuredResolver } from "../../StructuredResolver.js";
import { validateConditionsDelta, normalizeConditionsDelta } from "../../../selfHealing/JsonValidators.js";
import { ExtractorBase } from "../ExtractorBase.js";
import {
  CONDITIONS_FORMAT_SPEC,
  CONDITIONS_SYSTEM_PROMPT,
  conditionsHumanPrompt,
} from "./prompts.js";

/**
 * Extrator de condições (doc 27, Fase 2 — §6.2/§7.2).
 * Roda o LLM só com sinal de dano na narração OU `violent == true` do
 * micro-árbitro (força o sinal — o orquestrador passa via `opts`).
 */
export class ConditionsExtractorAgent extends ExtractorBase<ConditionsDelta> {
  readonly formatSpec = CONDITIONS_FORMAT_SPEC;
  readonly temperature = 0.0;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
  ) {
    super();
  }

  hasSignal(narration: string): boolean {
    return /queda|sangue|fratura|queimadura|corte|ferid|machuc|torc|quebr|dor|inconsciente|desmai|hematoma|cicatriz|contus|entorse|luxa/i.test(narration);
  }

  validate(value: unknown): value is ConditionsDelta {
    return validateConditionsDelta(value);
  }

  async extract(
    state: GameState,
    microNarration: string,
    opts: { violent?: boolean } = {},
  ): Promise<ConditionsDelta> {
    if (!opts.violent && !this.hasSignal(microNarration)) return {};
    const healed = await this.resolver.resolveJson({
      agent: 'Extrator:Condições',
      turn: state.turnNumber,
      system: CONDITIONS_SYSTEM_PROMPT,
      human: conditionsHumanPrompt(state, microNarration),
      schemaSpec: this.formatSpec,
      validate: validateConditionsDelta,
      compact: true,
    });
    if (!healed) return {};
    return normalizeConditionsDelta(healed.value);
  }

  getClient(): LlmClient {
    return this.client;
  }
}
