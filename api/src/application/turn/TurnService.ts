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
  StepAction,
  TurnStep,
  StepDeltas,
  StepResolution,
  MovementDelta,
} from "../../domain/types.js";
import type { NormalizedSceneDelta } from "../shared/selfHealing/JsonValidators.js";
import type { IOutputWriter, ILogger } from "../../domain/ports.js";
import type { WorldService } from "../world/WorldService.js";
import type { CharacterService } from "../characters/CharacterService.js";
import { renderResolution } from "./ArbiterService.js";
import { normalizeForGrounding } from "../../domain/utils/grounding.js";

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
export interface IStepArbiter {
  arbitrateStep(state: GameState, action: StepAction, reactions?: StepAction[]): Promise<StepResolution>;
  applyDiceRule(resolution: StepResolution, roll: number | undefined): StepResolution;
}

export interface IReactionGate {
  gateReactions(action: StepAction, actorWhere: string, candidates: GateCandidate[], turn: number): Promise<GateRuling[]>;
}

export interface IStepNarrator {
  narrateStep(
    state: GameState,
    actionLine: string,
    resolution: StepResolution,
    opts?: { unexpected?: boolean },
  ): Promise<string>;
}

export interface IStepExtractor<T> {
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

/**
 * Turno = 1 ação de 1 ator + reações (`start → react* → arbiter →
 * narrate → finish`), com `turnNumber++` por turno. Cada fase é 1 chamada
 * HTTP para resposta visual progressiva; o ator gira por rotação
 * automática no `GameService`.
 */
export interface ActorAction {
  actor: Character;
  actorWhere: string;
  text: string;
  reasoning: string;
  roll: number;
  diceRoll: DiceRoll;
  action: StepAction;
}

export interface GateOutcome {
  allowed: AllowedRuling[];
  denied: GateRuling[];
  ordered: AllowedRuling[];
}

export interface ReactionResult {
  who: string;
  action: string;
  reasoning: string;
  ignored: boolean;
  channel: Exclude<GateChannel, 'none'>;
}

export interface CommitTurnInput {
  actorName: string;
  actionText: string;
  reactions: { who: string; action: string }[];
  resolution: StepResolution;
  actorWhere: string;
  narration: string;
  sceneDescription?: string | undefined;
  gate: {
    allowed: { who: string; channel: Exclude<GateChannel, 'none'> }[];
    denied: { who: string; why: string }[];
  };
  reacted: string[];
  ignored: string[];
}

export interface CommitTurnResult {
  pendingMoves: { who: string; to: string }[];
  resolutionLine: string;
  trace: TurnStep;
}

/** Ruling permitida: o gate garante `allow=true` ⇒ `channel != none`. */
export type AllowedRuling = GateRuling & { channel: Exclude<GateChannel, 'none'> };

function isAllowed(r: GateRuling): r is AllowedRuling {
  return r.allow && r.channel !== 'none';
}

/**
 * Orquestrador de ação única: 1 turno = 1 ator + reações
 * (`start/react/arbiter/narrate/finish`); `turnNumber++` 1x por turno
 * (fora, no `GameService`). Sem ordem fixa de iniciativa, sem teto de
 * reatores, sem gate por local em código.
 */
export class TurnService {
  private settings: GameSettings;
  private readonly logger: ILogger;

  constructor(
    private readonly arbiter: IStepArbiter,
    private readonly gate: IReactionGate,
    private readonly narrator: IStepNarrator,
    private readonly inventory: IStepExtractor<InventoryDelta>,
    private readonly movement: IStepExtractor<MovementDelta>,
    private readonly conditions: IStepExtractor<ConditionsDelta>,
    private readonly management: WorldService,
    private readonly cpuReflection: CharacterService,
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
    // O narrador guarda snapshot da construção — repassa para o radio
    // `narrationSize` valer no fluxo faseado.
    (this.narrator as unknown as { updateSettings?: (s: GameSettings) => void }).updateSettings?.(settings);
  }

  /** Personagens que podem agir/reagir: ativos (sem `status` = ativo). */
  activeRoster(state: GameState): Character[] {
    return state.characters.filter((c) => !c.status || c.status === 'active');
  }

  /**
   * Fase `start`: resolve a ação do ator (texto do jogador ou reflexão
   * do NPC via LLM), rola o d20 e roda o gate de percepção (LLM).
   * Não muta o mundo — só o `currentObjective` do ator NPC na cópia.
   */
  async startAction(
    state: GameState,
    actor: Character,
    playerActions: Map<string, string>,
    output?: IOutputWriter,
  ): Promise<ActorAction & GateOutcome> {
    const roster = this.activeRoster(state);
    const actorWhere = actor.currentLocation ?? 'local desconhecido';
    if (output) output.writeLine(`[Spotlight] ${actor.name} age...`);

    const { text: actionText, reasoning } = await this.resolveActorAction(state, actor, playerActions, [], output);
    const diceRoll = this.rollDice(actor);
    const action: StepAction = {
      actor: actor.name,
      text: actionText,
      target: this.inferTarget(actionText, actor.name, roster),
      roll: diceRoll.roll,
    };

    const candidates = this.eligibleCandidates(roster, actor, actionText);
    const rulings = await this.gate.gateReactions(action, actorWhere, candidates, state.turnNumber);
    const allowed = rulings.filter(isAllowed);
    const denied = rulings.filter((r) => !r.allow);
    const ordered = this.orderReactors(state, actorWhere, allowed);

    return {
      actor, actorWhere, text: actionText, reasoning,
      roll: diceRoll.roll, diceRoll, action,
      allowed, denied, ordered,
    };
  }

  /** d20: `godMode` ⇒ 20 para o jogador; demais rolam 1-20. */
  rollDice(actor: Character): DiceRoll {
    const isGodModeRoll = this.settings.godMode && actor.isPlayer === true;
    const roll = isGodModeRoll ? 20 : Math.floor(Math.random() * 20) + 1;
    return { characterName: actor.name, roll, isGodMode: isGodModeRoll };
  }

  /**
   * Fase `react`: 1 reator por chamada, na ordem de stake.
   * Falha do LLM ⇒ reator ignorado (segue sem ele); `ignorar` explícito
   * também é descartado antes do árbitro (defesa em profundidade).
   */
  async resolveReaction(
    state: GameState,
    reactor: Character,
    priorLines: string[],
    action: StepAction,
    channel: Exclude<GateChannel, 'none'>,
    output?: IOutputWriter,
  ): Promise<ReactionResult> {
    try {
      const decision = await this.cpuReflection.reflectAndAct(
        state, reactor, output, [...priorLines],
        { actionLine: `${action.actor} tenta: ${action.text}`, channel },
      );
      if (decision.action.trim().toLowerCase() === 'ignorar') {
        return { who: reactor.name, action: decision.action, reasoning: decision.reasoning, ignored: true, channel };
      }
      return { who: reactor.name, action: decision.action, reasoning: decision.reasoning, ignored: false, channel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn('[React] falha na reação, seguindo sem ela', { charName: reactor.name, error: msg });
      return { who: reactor.name, action: '', reasoning: '', ignored: true, channel };
    }
  }

  /** Fase `arbiter`: julga 1 ação + reações e aplica a regra do dado. */
  async arbitrateAction(
    state: GameState,
    action: StepAction,
    reactions: StepAction[],
    roll: number | undefined,
  ): Promise<StepResolution> {
    const rawResolution = await this.arbiter.arbitrateStep(state, action, reactions);
    return this.arbiter.applyDiceRule(rawResolution, roll);
  }

  /** Fase `narrate`: 1-2 parágrafos sobre 1 fato. */
  async narrateAction(
    state: GameState,
    actionLine: string,
    resolution: StepResolution,
    unexpected: boolean,
  ): Promise<string> {
    return this.narrator.narrateStep(state, actionLine, resolution, { unexpected });
  }

  renderResolutionLine(actor: string, text: string, resolution: StepResolution): string {
    return renderResolution([{ actor, text, outcome: resolution.outcome, reason: resolution.reason }]);
  }

  /**
   * Fase `finish` (commit): scratchpad + ledger + extratores + vitalidade
   * + cena + memória factual. Muta `state` (cópia de trabalho da saga).
   */
  async commitTurn(state: GameState, input: CommitTurnInput): Promise<CommitTurnResult> {
    const roster = this.activeRoster(state);
    const resolutionLine = this.renderResolutionLine(input.actorName, input.actionText, input.resolution);

    // Vitalidade derivada do `hit` (§5): success+violent ⇒ hit piora;
    // failure violenta ⇒ só auto-dano (ator no próprio `hit`); partial
    // violenta ⇒ hit piora (houve consequência física).
    const violentHits: string[] = [];
    if (input.resolution.violent) {
      if (input.resolution.outcome === 'failure') {
        if (input.resolution.hit.some((n) => n.toLowerCase() === input.actorName.toLowerCase())) {
          violentHits.push(input.actorName);
        }
      } else {
        violentHits.push(...input.resolution.hit);
      }
    }

    const actor = roster.find((c) => c.name === input.actorName);
    if (actor && !actor.isPlayer) {
      this.cpuReflection.recordArbiterResult(actor, state.turnNumber, resolutionLine, input.actionText);
    }
    for (const reaction of input.reactions) {
      const reactor = roster.find((c) => c.name === reaction.who);
      if (reactor && !reactor.isPlayer) {
        this.cpuReflection.recordArbiterResult(
          reactor, state.turnNumber,
          this.renderResolutionLine(reaction.who, reaction.action, input.resolution),
          reaction.action,
        );
      }
    }
    this.commitEvent(state, input.actorName, input.actionText, input.resolution, input.actorWhere);

    const [inventoryDelta, movementDelta, conditionsDelta] = await Promise.all([
      this.inventory.extract(state, input.narration),
      this.movement.extract(state, input.narration),
      this.conditions.extract(state, input.narration, { violent: input.resolution.violent }),
    ]);
    const deltas: StepDeltas = { inventory: inventoryDelta, movement: movementDelta, conditions: conditionsDelta };
    const merged = this.management.applyStepUpdates(state, input.narration, deltas);
    state.characters = merged.state.characters;
    if (merged.state.locations !== undefined) state.locations = merged.state.locations;
    if (merged.state.concepts !== undefined) state.concepts = merged.state.concepts;
    let pendingMoves = [...merged.pendingMoves];
    if (merged.pendingMoves.length > 0) {
      this.logger.warn('[Commit] moves pendentes', { moves: merged.pendingMoves });
    }

    // Cena + memória no fim do turno (ausente = turno sem cena).
    if (this.scene) {
      for (const name of new Set(violentHits.map((n) => n.toLowerCase()))) {
        const canonical = state.characters.find((c) => c.name.toLowerCase() === name)?.name ?? name;
        const next = this.management.advanceVitality(state, canonical, 'worse');
        state.characters = next.characters;
      }
      const sceneNarration = input.sceneDescription
        ? `${input.sceneDescription}\n\n${input.narration}`
        : input.narration;
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
        state.factSheet, turnEvents, [input.narration], state.turnNumber,
      );
    }

    const reactedSet = new Set(input.reacted.map((n) => n.toLowerCase()));
    const queue: TurnStep['queue'] = [
      { who: input.actorName, where: input.actorWhere, status: 'done' },
      ...input.gate.allowed.map((r) => {
        const c = roster.find((x) => x.name === r.who);
        const where = c?.currentLocation ?? 'local desconhecido';
        if (reactedSet.has(r.who.toLowerCase())) return { who: r.who, where, status: 'done' as const };
        return { who: r.who, where, status: 'ignored' as const };
      }),
      ...input.gate.denied.map((r) => {
        const c = roster.find((x) => x.name === r.who);
        return { who: r.who, where: c?.currentLocation ?? 'local desconhecido', status: 'denied' as const };
      }),
    ];
    const trace: TurnStep = {
      step: 1,
      actor: input.actorName,
      actorWhere: input.actorWhere,
      queue,
      spotlight: input.actorName,
      gate: {
        allowed: input.gate.allowed.map((r) => ({ who: r.who, channel: r.channel })),
        denied: input.gate.denied.map((r) => ({ who: r.who, why: r.why })),
      },
    };

    return { pendingMoves, resolutionLine, trace };
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

  /** Primeiro nome citado (ordem do roster) — `StepAction.target`. */
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

  async resolveActorAction(
    state: GameState,
    actor: Character,
    playerActions: Map<string, string>,
    priorLines: string[],
    output: IOutputWriter | undefined,
  ): Promise<{ text: string; reasoning: string }> {
    if (actor.isPlayer === true) {
      return { text: playerActions.get(actor.name) ?? `${actor.name} hesita por um momento.`, reasoning: '' };
    }
    try {
      const decision = await this.cpuReflection.reflectAndAct(state, actor, output, [...priorLines]);
      return { text: decision.action, reasoning: decision.reasoning };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn('[Step] falha na reflexão, usando fallback', { charName: actor.name, error: msg });
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
    resolution: StepResolution,
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
