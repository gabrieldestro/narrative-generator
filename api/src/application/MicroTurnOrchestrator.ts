import type {
  ActionEvent,
  Character,
  ConditionsDelta,
  DiceRoll,
  FactSheet,
  GameSettings,
  GameState,
  GateCandidate,
  GateChannel,
  GateRuling,
  InventoryDelta,
  MicroAction,
  MicroBlock,
  MicroDeltas,
  MicroResolution,
  MovementDelta,
  NpcDecision,
} from "../domain/types.js";
import type { NormalizedSceneDelta } from "./selfHealing/JsonValidators.js";
import type { IOutputWriter, ILogger } from "../domain/ports.js";
import type { GameManagementService } from "./GameManagementService.js";
import type { CpuReflectionService } from "./npcAgent/CpuReflectionService.js";
import { renderLegacyResolution } from "./llm/arbiter/ArbiterAgent.js";
import { normalizeForGrounding } from "./utils/grounding.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

/** Dependências do orquestrador — interfaces finas, nunca `LlmService` (§7.2). */
export interface IMicroArbiter {
  arbitrateMicro(state: GameState, action: MicroAction, reactions?: MicroAction[]): Promise<MicroResolution>;
  applyDiceRule(resolution: MicroResolution, roll: number | undefined): MicroResolution;
}

export interface IReactionGate {
  gateReactions(action: MicroAction, actorWhere: string, candidates: GateCandidate[], turn: number): Promise<GateRuling[]>;
}

export interface IMicroNarrator {
  narrateMicro(
    state: GameState,
    actionLine: string,
    resolution: MicroResolution,
    opts?: { unexpected?: boolean },
  ): Promise<string>;
}

export interface IMicroExtractor<T> {
  hasSignal(narration: string): boolean;
  extract(state: GameState, narration: string, opts?: { violent?: boolean }): Promise<T>;
}

/** Cena (doc 27, Fase 4): roda 1x por turno, fim de cena. */
export interface ISceneExtractor {
  extract(state: GameState, sceneNarration: string): Promise<NormalizedSceneDelta>;
}

export interface ISceneMemory {
  consolidateFacts(
    oldSheet: FactSheet | undefined,
    sceneEvents: ActionEvent[],
    sceneNarrations: string[],
    turn?: number,
  ): Promise<FactSheet>;
}

export interface MicroTurnResult {
  narrative: string;
  logicalResolution: string;
  npcDecisions: NpcDecision[];
  diceRolls: DiceRoll[];
  npcOrder: string[];
  microTrace: MicroBlock[];
  pendingMoves: { who: string; to: string }[];
}

export interface RunTurnOptions {
  output?: IOutputWriter;
  unexpectedEvent?: boolean;
  sceneDescription?: string | undefined;
}

/** Ruling permitida: o gate garante `allow=true` ⇒ `channel != none`. */
export type AllowedRuling = GateRuling & { channel: Exclude<GateChannel, 'none'> };

function isAllowed(r: GateRuling): r is AllowedRuling {
  return r.allow && r.channel !== 'none';
}

/**
 * Orquestrador spotlight (doc 27, Fase 3 — §4).
 * 1 turno (`POST /turn`) = N micros, 1 por personagem ativo; `turnNumber++`
 * 1x por turno (fora, no `GameEngine`). Sem ordem fixa de iniciativa, sem
 * teto de reatores, sem gate por local em código.
 */
export class MicroTurnOrchestrator {
  private settings: GameSettings;
  private readonly logger: ILogger;

  constructor(
    private readonly arbiter: IMicroArbiter,
    private readonly gate: IReactionGate,
    private readonly narrator: IMicroNarrator,
    private readonly inventory: IMicroExtractor<InventoryDelta>,
    private readonly movement: IMicroExtractor<MovementDelta>,
    private readonly conditions: IMicroExtractor<ConditionsDelta>,
    private readonly management: GameManagementService,
    private readonly cpuReflection: CpuReflectionService,
    settings: GameSettings,
    logger?: ILogger,
    /** Doc 27, Fase 4: cena + memória no fim do turno (ausente = turno sem cena). */
    private readonly scene?: { extractor: ISceneExtractor; memory: ISceneMemory },
  ) {
    this.settings = settings;
    this.logger = logger ?? new NullLogger();
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  async runTurn(
    state: GameState,
    playerActions: Map<string, string>,
    opts: RunTurnOptions = {},
  ): Promise<MicroTurnResult> {
    const output = opts.output;
    const roster = state.characters.filter((c) => !c.status || c.status === 'active');
    const spotlight = this.spotlightOrder(roster);
    const npcOrder = spotlight.map((c) => c.name);

    const npcDecisions: NpcDecision[] = [];
    const diceRolls: DiceRoll[] = [];
    const microTrace: MicroBlock[] = [];
    let pendingMoves: { who: string; to: string }[] = [];
    const microNarrations: string[] = [];
    const legacyEntries: { actor: string; text: string; outcome: MicroResolution['outcome']; reason: string }[] = [];
    const violentHits: string[] = [];
    const priorLines: string[] = [];

    let micro = 0;
    for (const actor of spotlight) {
      micro++;
      const actorWhere = actor.currentLocation ?? 'local desconhecido';
      if (output) output.writeLine(`[Spotlight] ${actor.name} age (micro ${micro}/${spotlight.length})...`);

      // ── Ação única ──
      const { text: actionText, reasoning } = await this.resolveActorAction(state, actor, playerActions, priorLines, output);
      const isGodModeRoll = this.settings.godMode && actor.isPlayer === true;
      const roll = isGodModeRoll ? 20 : Math.floor(Math.random() * 20) + 1;
      diceRolls.push({ characterName: actor.name, roll, isGodMode: isGodModeRoll });
      const action: MicroAction = {
        actor: actor.name,
        text: actionText,
        target: this.inferTarget(actionText, actor.name, roster),
        roll,
      };
      priorLines.push(`${actor.name}: ${actionText}`);

      // ── Elegibilidade + gate de percepção ──
      const candidates = this.eligibleCandidates(roster, actor, actionText);
      const rulings = await this.gate.gateReactions(action, actorWhere, candidates, state.turnNumber);
      const allowed = rulings.filter(isAllowed);
      const denied = rulings.filter((r) => !r.allow);
      const ordered = this.orderReactors(state, actorWhere, allowed);

      // ── Reações (sequencial por stake, com priorActions) ──
      // Decisão armadilha (b): sequencial preserva a semântica anti-contradição
      // de `CpuAgentPrompts` (priorActions ordenados); paralelo quebraria a ordem.
      const reactions: MicroAction[] = [];
      const reacted = new Set<string>();
      const ignored = new Set<string>();
      for (const ruling of ordered) {
        const char = roster.find((c) => c.name === ruling.who)!;
        try {
          const decision = await this.cpuReflection.reflectAndAct(
            state, char, output, [...priorLines],
            { actionLine: `${action.actor} tenta: ${action.text}`, channel: ruling.channel },
          );
          if (decision.action.trim().toLowerCase() === 'ignorar') {
            ignored.add(char.name);
            continue;
          }
          reactions.push({ actor: char.name, text: decision.action });
          priorLines.push(`${char.name}: ${decision.action}`);
          reacted.add(char.name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn('[Micro] falha na reação, seguindo sem ela', { charName: char.name, error: msg });
          ignored.add(char.name);
        }
      }

      // ── Micro-árbitro + regra do dado ──
      const rawResolution = await this.arbiter.arbitrateMicro(state, action, reactions);
      const resolution = this.arbiter.applyDiceRule(rawResolution, roll);
      // Vitalidade derivada do `hit` (§5): success+violent ⇒ hit piora;
      // failure violenta ⇒ só auto-dano (ator no próprio `hit`); partial
      // violenta ⇒ hit piora (houve consequência física). Vai para
      // `advanceVitality` no fechamento da cena (abaixo).
      if (resolution.violent) {
        if (resolution.outcome === 'failure') {
          if (resolution.hit.some((n) => n.toLowerCase() === actor.name.toLowerCase())) {
            violentHits.push(actor.name);
          }
        } else {
          violentHits.push(...resolution.hit);
        }
      }

      // ── Micro-narração ──
      const actionLine = `${actor.name} tenta: ${actionText} (d20: ${roll})`;
      const microNarration = await this.narrator.narrateMicro(state, actionLine, resolution, {
        unexpected: micro === 1 && opts.unexpectedEvent === true,
      });
      microNarrations.push(microNarration);

      // ── Commit: scratchpad + ledger + fusão ──
      const legacyLine = renderLegacyResolution([{ actor: actor.name, text: actionText, outcome: resolution.outcome, reason: resolution.reason }]);
      legacyEntries.push({ actor: actor.name, text: actionText, outcome: resolution.outcome, reason: resolution.reason });
      if (!actor.isPlayer) {
        this.cpuReflection.recordArbiterResult(actor, state.turnNumber, legacyLine, actionText);
      }
      for (const reaction of reactions) {
        const reactor = roster.find((c) => c.name === reaction.actor)!;
        if (!reactor.isPlayer) {
          this.cpuReflection.recordArbiterResult(
            reactor, state.turnNumber,
            renderLegacyResolution([{ actor: reaction.actor, text: reaction.text, outcome: resolution.outcome, reason: resolution.reason }]),
            reaction.text,
          );
        }
      }
      this.commitEvent(state, actor.name, actionText, resolution, actorWhere);

      const [inventoryDelta, movementDelta, conditionsDelta] = await Promise.all([
        this.inventory.extract(state, microNarration),
        this.movement.extract(state, microNarration),
        this.conditions.extract(state, microNarration, { violent: resolution.violent }),
      ]);
      const deltas: MicroDeltas = { inventory: inventoryDelta, movement: movementDelta, conditions: conditionsDelta };
      const merged = this.management.applyMicroUpdates(state, microNarration, deltas);
      state.characters = merged.state.characters;
      if (merged.state.locations !== undefined) state.locations = merged.state.locations;
      if (merged.state.concepts !== undefined) state.concepts = merged.state.concepts;
      pendingMoves.push(...merged.pendingMoves);
      if (merged.pendingMoves.length > 0) {
        this.logger.warn('[Micro] moves pendentes (cena-extrator na Fase 4)', { moves: merged.pendingMoves });
      }

      // ── Trace do micro ──
      const queue: MicroBlock['queue'] = [
        { who: actor.name, where: actorWhere, status: 'done' },
        ...ordered.map((r) => {
          const c = roster.find((x) => x.name === r.who)!;
          const where = c.currentLocation ?? 'local desconhecido';
          if (reacted.has(r.who)) return { who: r.who, where, status: 'done' as const };
          return { who: r.who, where, status: 'ignored' as const };
        }),
        ...denied.map((r) => {
          const c = roster.find((x) => x.name === r.who);
          return { who: r.who, where: c?.currentLocation ?? 'local desconhecido', status: 'denied' as const };
        }),
      ];
      microTrace.push({
        micro,
        actor: actor.name,
        actorWhere,
        queue,
        spotlight: actor.name,
        gate: {
          allowed: ordered.map((r) => ({ who: r.who, channel: r.channel })),
          denied: denied.map((r) => ({ who: r.who, why: r.why })),
        },
      });

      if (!actor.isPlayer) {
        npcDecisions.push({
          characterName: actor.name,
          action: actionText,
          reasoning,
          success: resolution.outcome !== 'failure',
        });
      }
    }

    const body = microNarrations.join('\n\n');
    const narrative = opts.sceneDescription ? `${opts.sceneDescription}\n\n${body}` : body;

    // ── Fechamento da cena (doc 27, Fase 4): 1x por turno ──
    // Turno típico (2-6 micros) ≈ 1 cena; eventual contador de micros (3-5) é
    // ajuste futuro. Sem `scene`: turno sem cena (comportamento Fase 3).
    if (this.scene) {
      for (const name of new Set(violentHits.map((n) => n.toLowerCase()))) {
        const canonical = state.characters.find((c) => c.name.toLowerCase() === name)?.name ?? name;
        const next = this.management.advanceVitality(state, canonical, 'worse');
        state.characters = next.characters;
      }
      const sceneNarration = opts.sceneDescription ? `${opts.sceneDescription}\n\n${body}` : body;
      const sceneDelta = await this.scene.extractor.extract(state, sceneNarration);
      const mergedScene = this.management.applySceneUpdates(state, sceneNarration, sceneDelta);
      state.characters = mergedScene.characters;
      if (mergedScene.locations !== undefined) state.locations = mergedScene.locations;
      // Re-tenta os `pendingMoves` contra os locais recém-criados.
      if (pendingMoves.length > 0) {
        const retry = this.management.applyMovementDelta(state, sceneNarration, {
          move: pendingMoves.map((m) => ({ who: m.who, to: m.to })),
        });
        state.characters = retry.state.characters;
        pendingMoves = retry.pendingMoves;
      }
      const turnEvents = (state.events ?? []).filter((e) => e.turn === state.turnNumber);
      state.factSheet = await this.scene.memory.consolidateFacts(
        state.factSheet, turnEvents, microNarrations, state.turnNumber,
      );
    }

    return {
      narrative,
      logicalResolution: legacyEntries.map((e) =>
        renderLegacyResolution([{ actor: e.actor, text: e.text, outcome: e.outcome, reason: e.reason }]),
      ).join('\n'),
      npcDecisions,
      diceRolls,
      npcOrder,
      microTrace,
      pendingMoves,
    };
  }

  /** Spotlight rotativo cobrindo todos os ativos: players, depois NPCs (roster). */
  spotlightOrder(roster: Character[]): Character[] {
    const eligible = roster.filter((c) => (c.vitality ?? 'ileso') !== 'caído');
    return [
      ...eligible.filter((c) => c.isPlayer === true),
      ...eligible.filter((c) => c.isPlayer !== true),
    ];
  }

  /** Único corte duro, sem LLM: ativo + não-caído + não é o ator (§4.3). */
  eligibleCandidates(roster: Character[], actor: Character, actionText: string): GateCandidate[] {
    const flags = this.resolveStakeFlags(actionText, actor.name, roster);
    const out: GateCandidate[] = [];
    for (const c of roster) {
      if (c.name === actor.name) continue;
      if (c.status && c.status !== 'active') continue;
      if ((c.vitality ?? 'ileso') === 'caído') continue;
      const flag = flags.get(c.name.toLowerCase()) ?? { isTarget: false, ownsItem: false };
      out.push({ name: c.name, where: c.currentLocation ?? 'local desconhecido', ...flag });
    }
    return out;
  }

  /**
   * Heurística de stake — armadilha (a): `reflectAndAct` retorna só
   * `action:string`, sem `target`. Sem produtor estruturado, o orquestrador
   * deriva `isTarget` (nome citado) e `ownsItem` (item do inventário citado).
   */
  resolveStakeFlags(
    actionText: string,
    actorName: string,
    roster: Character[],
  ): Map<string, { isTarget: boolean; ownsItem: boolean }> {
    const haystack = normalizeForGrounding(actionText);
    const flags = new Map<string, { isTarget: boolean; ownsItem: boolean }>();
    for (const c of roster) {
      if (c.name.toLowerCase() === actorName.toLowerCase()) continue;
      const nameHit = c.name.length >= 3 && haystack.includes(normalizeForGrounding(c.name));
      let ownsHit = false;
      for (const item of c.inventory ?? []) {
        if (item.length >= 4 && haystack.includes(normalizeForGrounding(item))) {
          ownsHit = true;
          break;
        }
      }
      if (nameHit || ownsHit) {
        flags.set(c.name.toLowerCase(), { isTarget: nameHit, ownsItem: ownsHit });
      }
    }
    return flags;
  }

  /** Primeiro nome citado (ordem do roster) — `MicroAction.target`. */
  inferTarget(actionText: string, actorName: string, roster: Character[]): string | undefined {
    const haystack = normalizeForGrounding(actionText);
    for (const c of roster) {
      if (c.name.toLowerCase() === actorName.toLowerCase()) continue;
      if (c.name.length >= 3 && haystack.includes(normalizeForGrounding(c.name))) {
        return c.name;
      }
    }
    return undefined;
  }

  /**
   * Ordena por stake, não filtra por local, não corta por número (§4.3):
   * alvo > dono/guardião > mesmo local > demais. Anti-spam barato: NPC que
   * falhou na mesma ação 2x seguidas (`events[-6]`) cai para o fim.
   */
  orderReactors(state: GameState, actorWhere: string, allowed: AllowedRuling[]): AllowedRuling[] {
    const here = actorWhere.toLowerCase();
    const demoted = this.spamDemoted(state);
    const tier = (r: AllowedRuling): number => {
      // `stake` cobre alvo + dono (o gate não distingue) — mesma prioridade.
      if (r.channel === 'stake') return 0;
      const where = this.whereOf(state, r.who).toLowerCase();
      if (r.channel === 'saw' || where === here) return 1;
      return 2;
    };
    return [...allowed].sort((a, b) => {
      const penaltyA = demoted.has(a.who.toLowerCase()) ? 10 : 0;
      const penaltyB = demoted.has(b.who.toLowerCase()) ? 10 : 0;
      return tier(a) + penaltyA - (tier(b) + penaltyB);
    });
  }

  private spamDemoted(state: GameState): Set<string> {
    const recent = (state.events ?? []).slice(-6);
    const failures = new Map<string, Map<string, number>>();
    for (const e of recent) {
      if (e.outcome !== 'failure') continue;
      const key = e.who.toLowerCase();
      if (!failures.has(key)) failures.set(key, new Map());
      const byDid = failures.get(key)!;
      byDid.set(e.did, (byDid.get(e.did) ?? 0) + 1);
    }
    const demoted = new Set<string>();
    for (const [who, byDid] of failures) {
      for (const count of byDid.values()) {
        if (count >= 2) { demoted.add(who); break; }
      }
    }
    return demoted;
  }

  private whereOf(state: GameState, name: string): string {
    return state.characters.find((c) => c.name === name)?.currentLocation ?? 'local desconhecido';
  }

  private async resolveActorAction(
    state: GameState,
    actor: Character,
    playerActions: Map<string, string>,
    priorLines: string[],
    output?: IOutputWriter,
  ): Promise<{ text: string; reasoning: string }> {
    if (actor.isPlayer === true) {
      return { text: playerActions.get(actor.name) ?? `${actor.name} hesita por um momento.`, reasoning: '' };
    }
    try {
      const decision = await this.cpuReflection.reflectAndAct(state, actor, output, [...priorLines]);
      return { text: decision.action, reasoning: decision.reasoning };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn('[Micro] falha na reflexão, usando fallback', { charName: actor.name, error: msg });
      const fallback = `${actor.name} observa os arredores e reconsidera suas opções.`;
      if (output) output.writeLine(`[CPU - ${actor.name}] (fallback) ${fallback}`);
      return { text: fallback, reasoning: '' };
    }
  }

  /** Ledger factual: a engine escreve, sem LLM (§8). `did` = verbo curto. */
  private commitEvent(
    state: GameState,
    who: string,
    actionText: string,
    resolution: MicroResolution,
    where: string,
  ): void {
    if (!Array.isArray(state.events)) state.events = [];
    if (typeof state.nextSeq !== 'number') state.nextSeq = 1;
    state.events.push({
      seq: state.nextSeq++,
      turn: state.turnNumber,
      who,
      did: shortDid(actionText),
      outcome: resolution.outcome,
      where,
    });
  }
}

/** Primeiras 6 palavras — fato curto, não prosa (§8: fato ≠ prosa). */
export function shortDid(actionText: string): string {
  const words = actionText.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : '(ação)';
}
