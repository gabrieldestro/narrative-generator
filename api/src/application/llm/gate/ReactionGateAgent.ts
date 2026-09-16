import type { GateCandidate, GateChannel, GateRuling, StepAction } from "../../../domain/types.js";
import type { LlmClient } from "../LlmClient.js";
import type { IStructuredResolver } from "../StructuredResolver.js";
import { validateGateRulings, normalizeGateRulings } from "../../selfHealing/JsonValidators.js";
import { GATE_FORMAT_SPEC, GATE_SYSTEM_PROMPT, gateHumanPrompt } from "./prompts.js";

/**
 * Árbitro de percepção (doc 27, Fase 3 — §4.3/§6.5).
 * 1 chamada batch por step; decide QUEM pode reagir. Negado nem vê a ação.
 * Fail-closed: combinação inválida (`allow=true` + `channel=none`) vira
 * negação; falha total após repair → fallback determinístico.
 */
export class ReactionGateAgent {
  /** Temp por função (§3): gate `0.0` (mesma ressalva de factory do árbitro). */
  readonly temperature = 0.0;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
  ) {}

  async gateReactions(
    action: StepAction,
    actorWhere: string,
    candidates: GateCandidate[],
    turn: number,
  ): Promise<GateRuling[]> {
    if (candidates.length === 0) return [];
    const healed = await this.resolver.resolveJson({
      agent: 'Gate:Percepção',
      turn,
      system: GATE_SYSTEM_PROMPT,
      human: gateHumanPrompt(action, actorWhere, candidates),
      schemaSpec: GATE_FORMAT_SPEC,
      validate: validateGateRulings,
      compact: true,
    });
    if (!healed) return this.fallback(action, actorWhere, candidates);
    const known = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
    const seen = new Set<string>();
    const rulings: GateRuling[] = [];
    for (const raw of normalizeGateRulings(healed.value).rulings) {
      const key = raw.who.toLowerCase();
      const candidate = known.get(key);
      if (!candidate || seen.has(key)) continue; // `who` fora da lista → descarta
      seen.add(key);
      const channel = raw.channel as GateChannel;
      if (!raw.allow || channel === 'none') {
        rulings.push({ who: candidate.name, allow: false, channel: 'none', why: raw.why });
      } else {
        rulings.push({ who: candidate.name, allow: true, channel, why: raw.why });
      }
    }
    // Candidato sem ruling → negação explícita (fail-closed).
    for (const c of candidates) {
      if (!seen.has(c.name.toLowerCase())) {
        rulings.push({ who: c.name, allow: false, channel: 'none', why: 'sem decisão do gate' });
      }
    }
    return rulings;
  }

  /**
   * Fallback determinístico (exceção documentada de fail-safe, §4.3 item 2):
   * permite mesmo-local (`saw`) + `isTarget`/`ownsItem` (`stake`).
   * Único `if` de local do plano — só quando o gate falha, nunca trava o step.
   */
  fallback(action: StepAction, actorWhere: string, candidates: GateCandidate[]): GateRuling[] {
    void action;
    const here = actorWhere.toLowerCase();
    return candidates.map((c) => {
      if (c.isTarget || c.ownsItem) {
        return { who: c.name, allow: true, channel: 'stake' as GateChannel, why: 'fallback: alvo/dono do efeito' };
      }
      if (c.where.toLowerCase() === here) {
        return { who: c.name, allow: true, channel: 'saw' as GateChannel, why: 'fallback: mesmo local' };
      }
      return { who: c.name, allow: false, channel: 'none' as GateChannel, why: 'fallback: sem percepção' };
    });
  }

  getClient(): LlmClient {
    return this.client;
  }
}
