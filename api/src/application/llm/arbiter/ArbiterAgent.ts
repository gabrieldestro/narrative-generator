import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, MicroAction, MicroOutcome, MicroResolution } from "../../../domain/types.js";
import type { LlmClient } from "../LlmClient.js";
import type { IStructuredResolver } from "../StructuredResolver.js";
import type { SelfHealingService } from "../../selfHealing/SelfHealingService.js";
import { validateMicroArbiter } from "../../selfHealing/JsonValidators.js";
import { arbiterSystemPrompt, arbiterHumanPrompt } from "../../prompts.js";
import {
  MICRO_ARBITER_SYSTEM_PROMPT,
  MICRO_ARBITER_FORMAT_SPEC,
  microArbiterHumanPrompt,
} from "./prompts.js";

/**
 * Árbitro (doc 27, Fase 1 — §6.1/§7.2). Dono de `arbitrateMicro` (JSON
 * pequeno por ação) + `arbitrateLegacy` (adaptador do `arbitrateLogic`
 * gigante, mesma chamada/retry — prova do padrão sem mudar comportamento).
 */
export class ArbiterAgent {
  /** Temp por função (§3): árbitro/extratores `0.0-0.2`. Aplicação real exige
   * factory `(temp)=>model` — o modelo compartilhado atual (server.ts, 0.7)
   * não honra temp por chamada no backend LM Studio (validar antes da Fase 3). */
  readonly temperature = 0.1;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
    private readonly selfHealing: SelfHealingService,
  ) {}

  async arbitrateMicro(
    state: GameState,
    action: MicroAction,
    reactions: MicroAction[] = [],
  ): Promise<MicroResolution> {
    const healed = await this.resolver.resolveJson({
      agent: 'Árbitro:Micro',
      turn: state.turnNumber,
      system: MICRO_ARBITER_SYSTEM_PROMPT,
      human: microArbiterHumanPrompt(state, action, reactions),
      schemaSpec: MICRO_ARBITER_FORMAT_SPEC,
      validate: validateMicroArbiter,
      compact: true,
    });
    if (!healed) {
      return { outcome: 'partial', violent: false, reason: 'inconclusivo', hit: [] };
    }
    const raw = healed.value as { outcome: MicroOutcome; violent: boolean; reason: string; hit: string[] };
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
   * Adaptador legado: corpo movido de `LlmService.arbitrateLogic` (mesmos
   * prompts de `prompts.ts`, mesmo `invokeWithRetry`). Usado pelo
   * `GameEngine.processTurn` até o orquestrador da Fase 3 assumir.
   */
  async arbitrateLegacy(
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
  applyDiceRule(resolution: MicroResolution, roll: number | undefined): MicroResolution {
    if (resolution.outcome !== 'partial') return resolution;
    if (roll === 20) return { ...resolution, outcome: 'success' };
    if (roll === 1) return { ...resolution, outcome: 'failure' };
    return resolution;
  }

  /** Compat de leitura (não usado no loop — só exposto p/ Fase 3/tests). */
  getClient(): LlmClient {
    return this.client;
  }
}

export interface LegacyResolutionEntry {
  actor: string;
  text: string;
  outcome: MicroOutcome;
  reason: string;
}

/**
 * Converte `MicroResolution[]` → linhas legadas
 * `"Fulano tentou X -> Sucesso porque ..."` para o regex de
 * `GameEngine.ts` (`-> Sucesso/Falha`) e `CpuReflectionService`
 * continuar funcionando (uso real na Fase 3).
 */
export function renderLegacyResolution(entries: LegacyResolutionEntry[]): string {
  const label: Record<MicroOutcome, string> = {
    success: 'Sucesso',
    partial: 'Sucesso parcial',
    failure: 'Falha',
  };
  return entries
    .map((e) => `${e.actor} tentou ${e.text} -> ${label[e.outcome]} porque ${e.reason}`)
    .join('\n');
}
