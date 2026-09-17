import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, StepAction, StepOutcome, StepResolution } from "../../domain/types.js";
import type { LlmClient } from "../shared/LlmClient.js";
import type { IStructuredResolver } from "../shared/StructuredResolver.js";
import type { SelfHealingService } from "../shared/selfHealing/SelfHealingService.js";
import { validateStepArbiter } from "../shared/selfHealing/JsonValidators.js";
import { arbiterSystemPrompt, arbiterHumanPrompt } from "../../domain/prompts/game.js";
import {
  STEP_ARBITER_SYSTEM_PROMPT,
  STEP_ARBITER_FORMAT_SPEC,
  stepArbiterHumanPrompt,
} from "../../domain/prompts/arbiter.js";

/**
 * Árbitro. Dono de `arbitrateStep` (JSON pequeno por ação) +
 * `arbitrateTurn` (arbitragem do turno inteiro de uma vez, usada pelo
 * `LlmService.arbitrateLogic`).
 */
export class ArbiterService {
  /** Temp por função (§3): árbitro/extratores `0.0-0.2`. Aplicação real exige
   * factory `(temp)=>model` — o modelo compartilhado atual (server.ts, 0.7)
   * não honra temp por chamada no backend LM Studio (validar antes da Fase 3). */
  readonly temperature = 0.1;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
    private readonly selfHealing: SelfHealingService,
  ) {}

  async arbitrateStep(
    state: GameState,
    action: StepAction,
    reactions: StepAction[] = [],
  ): Promise<StepResolution> {
    const healed = await this.resolver.resolveJson({
      agent: 'Árbitro:Step',
      turn: state.turnNumber,
      system: STEP_ARBITER_SYSTEM_PROMPT,
      human: stepArbiterHumanPrompt(state, action, reactions),
      schemaSpec: STEP_ARBITER_FORMAT_SPEC,
      validate: validateStepArbiter,
      compact: true,
    });
    if (!healed) {
      return { outcome: 'partial', violent: false, reason: 'inconclusivo', hit: [] };
    }
    const raw = healed.value as { outcome: StepOutcome; violent: boolean; reason: string; hit: string[] };
    // Engine dispõe: `hit` filtrado por allowlist (case-insensitive); entrada
    // inválida descartada, não o objeto inteiro.
    const known = new Set(state.characters.map((c) => c.name.toLowerCase()));
    const seen = new Set<string>();
    const hit: string[] = [];
    for (const name of raw.hit) {
      const key = name.toLowerCase();
      if (known.has(key) && !seen.has(key)) {
        seen.add(key);
        hit.push(state.characters.find((c) => c.name.toLowerCase() === key)!.name);
      }
    }
    return {
      outcome: raw.outcome,
      violent: raw.violent,
      reason: raw.reason,
      hit,
    };
  }

  /**
   * Arbitragem do turno inteiro de uma vez (mesmos prompts de `prompts.ts`,
   * mesmo `invokeWithRetry`). Usada pelo `LlmService.arbitrateLogic`.
   */
  async arbitrateTurn(
    state: GameState,
    actions: string[],
    recentHistory?: string[],
    longTermSummary?: string,
  ): Promise<string> {
    const turnsToUse = recentHistory?.length ?? 0;
    return this.selfHealing.invokeWithRetry({
      agent: 'Árbitro',
      turn: state.turnNumber,
      maxBudget: turnsToUse,
      minBudget: 0,
      budgetStep: 1,
      build: (budget) => {
        const history = budget > 0 && recentHistory ? recentHistory.slice(-budget) : undefined;
        return [
          new SystemMessage(arbiterSystemPrompt),
          new HumanMessage(arbiterHumanPrompt(state, actions, history, longTermSummary)),
        ];
      },
    });
  }

  /** Regra do dado (determinística, em código, pós-`resolveJson`): só o
   * `partial` é modulado pelo d20 — impossível físico (`failure`) e trivial
   * (`success`) nunca mudam. `godMode=20` do player flui naturalmente. */
  applyDiceRule(resolution: StepResolution, roll: number | undefined): StepResolution {
    if (resolution.outcome !== 'partial') return resolution;
    if (roll === 20) return { ...resolution, outcome: 'success' };
    if (roll === 1) return { ...resolution, outcome: 'failure' };
    return resolution;
  }

  /** Compat de leitura (não usado no loop — só exposto p/ tests). */
  getClient(): LlmClient {
    return this.client;
  }
}

export interface ResolutionEntry {
  actor: string;
  text: string;
  outcome: StepOutcome;
  reason: string;
}

/**
 * Converte `StepResolution[]` → linhas
 * `"Fulano tentou X -> Sucesso porque ..."` para o scratchpad dos NPCs
 * (`CharacterService`).
 */
export function renderResolution(entries: ResolutionEntry[]): string {
  const label: Record<StepOutcome, string> = {
    success: 'Sucesso',
    partial: 'Sucesso parcial',
    failure: 'Falha',
  };
  return entries
    .map((e) => `${e.actor} tentou ${e.text} -> ${label[e.outcome]} porque ${e.reason}`)
    .join('\n');
}
