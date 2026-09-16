import type { GameState, Character, Location, CharacterStatus, WorldConcept } from "../domain/types.js";
import type {
  ConditionsDelta,
  InventoryDelta,
  StepDeltas,
  MovementDelta,
  Vitality,
} from "../domain/types.js";
import type { NormalizedSceneDelta } from "./selfHealing/JsonValidators.js";
import type { LlmService } from "./LlmService.js";
import type { ILogger } from "../domain/ports.js";
import { isGroundedTerm } from "./utils/grounding.js";
import { slugify } from "./utils/slugify.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export class GameManagementService {
  private readonly logger: ILogger;

  constructor(private readonly llmService: LlmService, logger?: ILogger) {
    this.logger = logger ?? new NullLogger();
  }

  /**
   * Adiciona um novo personagem ao GameState
   */
  public addCharacter(
    state: GameState,
    char: Omit<Character, "id" | "isPlayer"> & { id?: string; isPlayer?: boolean }
  ): GameState {
    const nextId = char.id || String(state.characters.length + 1);
    const newChar: Character = {
      id: nextId,
      name: char.name,
      description: char.description,
      personality: char.personality,
      isPlayer: char.isPlayer ?? false,
      currentLocation: char.currentLocation ?? "Ponto de Partida",
      inventory: char.inventory ?? [],
      status: char.status ?? "active",
      scratchpad: char.scratchpad ?? [],
    };

    if (char.longTermObjective !== undefined) {
      newChar.longTermObjective = char.longTermObjective;
    }
    if (char.currentObjective !== undefined) {
      newChar.currentObjective = char.currentObjective;
    }

    // Evita duplicados pelo nome
    const filtered = state.characters.filter(
      (c) => c.name.toLowerCase() !== char.name.toLowerCase()
    );

    return {
      ...state,
      characters: [...filtered, newChar],
    };
  }

  /**
   * Altera o status de um personagem (ex: marcar como morto ou perdido)
   */
  public setCharacterStatus(
    state: GameState,
    charName: string,
    status: CharacterStatus
  ): GameState {
    const oldChar = state.characters.find((c) => c.name.toLowerCase() === charName.toLowerCase());
    const oldStatus = oldChar?.status ?? 'active';
    const characters = state.characters.map((c) => {
      if (c.name.toLowerCase() === charName.toLowerCase()) {
        return { ...c, status };
      }
      return c;
    });

    this.logger.info('[StateUpdate] status alterado', { charName, from: oldStatus, to: status });
    return { ...state, characters };
  }

  /**
   * Adiciona um item ao inventário de um personagem
   */
  public addItemToCharacter(
    state: GameState,
    charName: string,
    item: string
  ): GameState {
    const characters = state.characters.map((c) => {
      if (c.name.toLowerCase() === charName.toLowerCase()) {
        const inventory = [...(c.inventory || [])];
        if (!inventory.some((i) => i.toLowerCase() === item.toLowerCase())) {
          inventory.push(item);
        }
        return { ...c, inventory };
      }
      return c;
    });

    this.logger.info('[StateUpdate] inventário alterado', { charName, added: [item], removed: [] });
    return { ...state, characters };
  }

  /**
   * Remove um item do inventário de um personagem
   */
  public removeItemFromCharacter(
    state: GameState,
    charName: string,
    item: string
  ): GameState {
    const characters = state.characters.map((c) => {
      if (c.name.toLowerCase() === charName.toLowerCase()) {
        const inventory = (c.inventory || []).filter(
          (i) => i.toLowerCase() !== item.toLowerCase()
        );
        return { ...c, inventory };
      }
      return c;
    });

    this.logger.info('[StateUpdate] inventário alterado', { charName, added: [], removed: [item] });
    return { ...state, characters };
  }

  /**
   * Adiciona manualmente uma localização ao grafo do mundo.
   * Ignora silenciosamente se o ID já existir.
   * Também cria as conexões bidirecionais com os locais existentes informados em connectedTo.
   */
  public addLocation(
    state: GameState,
    loc: Location
  ): GameState {
    const locations = [...(state.locations ?? [])];

    // Evita duplicados pelo ID
    if (locations.some((l) => l.id === loc.id)) {
      return state;
    }

    // Adiciona o novo local
    const newLocations = [...locations, { ...loc }];

    // Cria conexões bidirecionais: cada local já existente que esteja em loc.connectedTo
    // passa a ter loc.id na sua própria lista connectedTo
    const wired = newLocations.map((l) => {
      if (l.id !== loc.id && loc.connectedTo.includes(l.id) && !l.connectedTo.includes(loc.id)) {
        return { ...l, connectedTo: [...l.connectedTo, loc.id] };
      }
      return l;
    });

    this.logger.info('[StateUpdate] local adicionado', { id: loc.id, name: loc.name });
    return { ...state, locations: wired };
  }

  /**
   * Remove uma localização do grafo pelo ID.
   * Também limpa todas as referências a esse ID nos connectedTo dos demais locais.
   */
  public removeLocation(
    state: GameState,
    locationId: string
  ): GameState {
    const locations = (state.locations ?? [])
      .filter((l) => l.id !== locationId)
      .map((l) => ({
        ...l,
        connectedTo: l.connectedTo.filter((id) => id !== locationId),
      }));

    this.logger.info('[StateUpdate] local removido', { id: locationId });
    return { ...state, locations };
  }

  /**
   * Adiciona um conceito abstrato ao estado do jogo.
   * Evita duplicidade baseada no ID do conceito.
   */
  public addConcept(
    state: GameState,
    concept: WorldConcept
  ): GameState {
    const concepts = state.concepts ?? [];
    const exists = concepts.some((c) => c.id === concept.id);
    if (exists) {
      this.logger.warn('[StateUpdate] conceito já existe', { id: concept.id });
      return state;
    }
    this.logger.info('[StateUpdate] conceito adicionado', { id: concept.id, name: concept.name, type: concept.type });
    return { ...state, concepts: [...concepts, concept] };
  }

  /**
   * Remove um conceito abstrato do estado do jogo pelo ID.
   */
  public removeConcept(
    state: GameState,
    conceptId: string
  ): GameState {
    const concepts = (state.concepts ?? [])
      .filter((c) => c.id !== conceptId);
    this.logger.info('[StateUpdate] conceito removido', { id: conceptId });
    return { ...state, concepts };
  }

  /**
   * Executa a extração automática pós-narração usando o LLM e aplica as mutações ao estado
   */
  public async applyAutomaticStateUpdates(
    state: GameState,
    narration: string
  ): Promise<GameState> {
    const changes = await this.llmService.extractStateChanges(state, narration);
    let updatedState = { ...state };

    // 1. Processar mudanças de inventário
    if (changes.inventoryChanges) {
      for (const change of changes.inventoryChanges) {
        // Grounding log-only — avisa quando o item não
        // aparece na narração, mas AINDA aplica (enforcement estrito só nos
        // extratores por categoria).
        if (typeof change?.item === 'string' && !isGroundedTerm(change.item, narration)) {
          this.logger.warn('[Grounding] item sem citação na narração (aplicado mesmo assim)', {
            characterName: change.characterName,
            item: change.item,
          });
        }
        if (change.action === "add") {
          updatedState = this.addItemToCharacter(
            updatedState,
            change.characterName,
            change.item
          );
        } else if (change.action === "remove") {
          updatedState = this.removeItemFromCharacter(
            updatedState,
            change.characterName,
            change.item
          );
        }
      }
    }

    // 2. Processar ciclo de vida de personagens
    if (changes.characterLifecycle) {
      for (const lifecycle of changes.characterLifecycle) {
        const existing = updatedState.characters.find(
          (c) => c.name.toLowerCase() === lifecycle.characterName.toLowerCase()
        );

        if (lifecycle.status === "discovered") {
          if (!existing) {
            updatedState = this.addCharacter(updatedState, {
              name: lifecycle.characterName,
              description:
                lifecycle.description ?? "Um indivíduo recém-descoberto.",
              personality:
                lifecycle.personality ?? "Personalidade desconhecida.",
              isPlayer: false,
              currentLocation: lifecycle.location ?? "Local Desconhecido",
              inventory: [],
              status: "active",
            });
          } else {
            updatedState = this.setCharacterStatus(
              updatedState,
              lifecycle.characterName,
              "active"
            );
          }
        } else if (
          lifecycle.status === "dead" ||
          lifecycle.status === "lost" ||
          lifecycle.status === "active"
        ) {
          updatedState = this.setCharacterStatus(
            updatedState,
            lifecycle.characterName,
            lifecycle.status
          );
        }
      }
    }

    // 3. Processar novos locais descobertos
    if (changes.locationChanges?.discovered) {
      for (const loc of changes.locationChanges.discovered) {
        const locations = updatedState.locations || [];
        const exists = locations.some((l) => l.id === loc.id);
        if (!exists) {
          const newLoc: Location = {
            id: loc.id,
            name: loc.name,
            description: loc.description,
            connectedTo: loc.connectedTo ?? [],
          };
          updatedState.locations = [...locations, newLoc];
          this.logger.info('[StateUpdate] local descoberto via extração', { id: loc.id, name: loc.name });
        }
      }
    }

    // 4. Processar novas conexões de locais
    if (changes.locationChanges?.newConnections) {
      for (const conn of changes.locationChanges.newConnections) {
        updatedState.locations = (updatedState.locations || []).map((l) => {
          let connectedTo = [...l.connectedTo];
          if (l.id === conn.from && !connectedTo.includes(conn.to)) {
            connectedTo.push(conn.to);
          }
          if (l.id === conn.to && !connectedTo.includes(conn.from)) {
            connectedTo.push(conn.from);
          }
          return { ...l, connectedTo };
        });
      }
    }

    // 5. Processar novos conceitos descobertos
    if (changes.conceptChanges?.discovered) {
      for (const concept of changes.conceptChanges.discovered) {
        updatedState = this.addConcept(updatedState, {
          id: concept.id,
          type: concept.type,
          name: concept.name,
          description: concept.description,
        });
      }
    }

    this.logger.info('[StateUpdate] alterações aplicadas', {
      inventoryChanges: changes.inventoryChanges?.length ?? 0,
      lifecycleChanges: changes.characterLifecycle?.length ?? 0,
      locationChanges: changes.locationChanges?.discovered?.length ?? 0,
      conceptChanges: changes.conceptChanges?.discovered?.length ?? 0,
    });

    return updatedState;
  }

  // ── Fusão dos deltas do step por categoria ──
  // Chamado pelo `TurnOrchestrator`, 1x por step, com
  // os deltas já validados em forma pelos extratores. Aqui valem as regras
  // determinísticas: allowlist de nomes (case-insensitive) + grounding na
  // narração do step (descarte estrito).

  /** Move para local desconhecido: não aplica, devolve para o orquestrador
   * disparar o cena-extrator de forma síncrona. */
  public applyStepUpdates(
    state: GameState,
    stepNarration: string,
    deltas: StepDeltas,
  ): { state: GameState; pendingMoves: { who: string; to: string }[] } {
    let updated = { ...state };
    updated = this.applyInventoryDelta(updated, stepNarration, deltas.inventory);
    const movement = this.applyMovementDelta(updated, stepNarration, deltas.movement);
    updated = movement.state;
    updated = this.applyConditionsDelta(updated, stepNarration, deltas.conditions);
    return { state: updated, pendingMoves: movement.pendingMoves };
  }

  public applyInventoryDelta(
    state: GameState,
    stepNarration: string,
    delta: InventoryDelta | undefined,
  ): GameState {
    if (!delta) return state;
    let updated = { ...state };
    const apply = (entries: { who: string; item: string }[] | undefined, action: 'grab' | 'drop') => {
      for (const entry of entries ?? []) {
        const char = updated.characters.find((c) => c.name.toLowerCase() === entry.who.toLowerCase());
        if (!char) continue; // allowlist: nome válido
        if (!isGroundedTerm(entry.item, stepNarration)) continue; // grounding estrito
        updated = action === 'grab'
          ? this.addItemToCharacter(updated, char.name, entry.item)
          : this.removeItemFromCharacter(updated, char.name, entry.item);
      }
    };
    apply(delta.grab, 'grab');
    apply(delta.drop, 'drop');
    return updated;
  }

  public applyMovementDelta(
    state: GameState,
    stepNarration: string,
    delta: MovementDelta | undefined,
  ): { state: GameState; pendingMoves: { who: string; to: string }[] } {
    const pendingMoves: { who: string; to: string }[] = [];
    if (!delta) return { state, pendingMoves };
    let updated = { ...state };
    for (const entry of delta.move ?? []) {
      const char = updated.characters.find((c) => c.name.toLowerCase() === entry.who.toLowerCase());
      if (!char) continue;
      if (!isGroundedTerm(entry.to, stepNarration)) continue;
      const known = (updated.locations ?? []).find(
        (l) => l.name.toLowerCase() === entry.to.toLowerCase() || l.id.toLowerCase() === entry.to.toLowerCase(),
      );
      if (!known) {
        pendingMoves.push({ who: char.name, to: entry.to });
        continue;
      }
      updated = {
        ...updated,
        characters: updated.characters.map((c) =>
          c.name.toLowerCase() === char.name.toLowerCase() ? { ...c, currentLocation: known.name } : c,
        ),
      };
    }
    return { state: updated, pendingMoves };
  }

  public applyConditionsDelta(
    state: GameState,
    stepNarration: string,
    delta: ConditionsDelta | undefined,
  ): GameState {
    if (!delta) return state;
    let updated = { ...state };
    for (const entry of delta.conditions ?? []) {
      const char = updated.characters.find((c) => c.name.toLowerCase() === entry.who.toLowerCase());
      if (!char) continue;
      if (!isGroundedTerm(entry.add, stepNarration)) continue;
      const current = [...(char.conditions ?? [])];
      if (current.some((c) => c.toLowerCase() === entry.add.toLowerCase())) continue; // dedup
      if (current.length >= 3) continue; // max 3 por char (§6.2)
      updated = {
        ...updated,
        characters: updated.characters.map((c) =>
          c.name.toLowerCase() === char.name.toLowerCase() ? { ...c, conditions: [...current, entry.add] } : c,
        ),
      };
    }
    return updated;
  }

  // ── Doc 27, Fase 4 — vitalidade (§5) + fusão de cena (§6.3) ──

  private static readonly VITALITY_LADDER: Vitality[] = ['ileso', 'ferido', 'grave', 'caído'];

  /**
   * Transição de vitalidade em código (nunca o LLM direto).
   * `worse`: ileso→ferido→grave→caído (1 nível, sem pular).
   * `better` (só via cura narrativa explícita + cena-extrator): 1 nível de volta.
   */
  public advanceVitality(state: GameState, name: string, dir: 'worse' | 'better'): GameState {
    const char = state.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!char) return state;
    const current = char.vitality ?? 'ileso';
    const idx = GameManagementService.VITALITY_LADDER.indexOf(current);
    const next = dir === 'worse'
      ? GameManagementService.VITALITY_LADDER[Math.min(idx + 1, 3)]
      : GameManagementService.VITALITY_LADDER[Math.max(idx - 1, 0)];
    if (next === undefined || next === current) return state;
    this.logger.info('[Vitalidade] transição', { charName: char.name, from: current, to: next });
    return {
      ...state,
      characters: state.characters.map((c) =>
        c.name.toLowerCase() === char.name.toLowerCase() ? { ...c, vitality: next } : c,
      ),
    };
  }

  /**
   * Fusão do cena-extrator (1x por turno, fim de cena). Regras:
   * - `new_locations`: nome grounded na narração; engine slugifica o `id`
   *   (nunca aceita `id` do LLM); duplicado (id) ignorado.
   * - `new_npcs`: cria com `vitality=ileso, status=active, inventory=[]`.
   * - `dead`/`lost`: só com nome válido + evidência explícita na prosa
   *   (morte/perda); `caído` nunca vira `dead` sozinho.
   * - `healed` (cura narrativa explícita): 1 nível para trás + remove a
   *   condição citada em `what` (decisão armadilha a).
   */
  public applySceneUpdates(
    state: GameState,
    sceneNarration: string,
    delta: NormalizedSceneDelta,
  ): GameState {
    let updated = { ...state };

    for (const loc of delta.new_locations) {
      if (!isGroundedTerm(loc.name, sceneNarration)) continue;
      const id = slugify(loc.name);
      if ((updated.locations ?? []).some((l) => l.id === id)) continue;
      // Conecta aos locais conhecidos citados na mesma narração (grafo simples).
      const connectedTo = (updated.locations ?? [])
        .filter((l) => l.id !== id && isGroundedTerm(l.name, sceneNarration))
        .map((l) => l.id);
      updated = {
        ...updated,
        locations: [...(updated.locations ?? []), { id, name: loc.name, description: loc.desc, connectedTo }],
      };
      this.logger.info('[Cena] local novo', { id, name: loc.name });
    }

    for (const npc of delta.new_npcs) {
      if (!isGroundedTerm(npc.name, sceneNarration)) continue;
      if (updated.characters.some((c) => c.name.toLowerCase() === npc.name.toLowerCase())) continue;
      updated = this.addCharacter(updated, {
        name: npc.name,
        description: npc.desc || 'Personagem recém-descoberto.',
        personality: 'Personalidade desconhecida.',
        isPlayer: false,
        currentLocation: npc.where || 'Local Desconhecido',
        inventory: [],
        status: 'active',
      });
      // addCharacter não conhece vitalidade — garante o default do schema v4.
      updated = {
        ...updated,
        characters: updated.characters.map((c) =>
          c.name.toLowerCase() === npc.name.toLowerCase() ? { ...c, vitality: 'ileso' as Vitality, conditions: [] } : c,
        ),
      };
      this.logger.info('[Cena] NPC novo', { name: npc.name, where: npc.where });
    }

    for (const name of delta.dead) {
      const char = updated.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!char) continue;
      if (!isGroundedTerm(name, sceneNarration)) continue;
      if (!DEATH_EVIDENCE.test(sceneNarration)) continue;
      updated = this.setCharacterStatus(updated, char.name, 'dead');
    }

    for (const name of delta.lost) {
      const char = updated.characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!char) continue;
      if (!isGroundedTerm(name, sceneNarration)) continue;
      if (!LOSS_EVIDENCE.test(sceneNarration)) continue;
      updated = this.setCharacterStatus(updated, char.name, 'lost');
    }

    for (const heal of delta.healed) {
      const char = updated.characters.find((c) => c.name.toLowerCase() === heal.who.toLowerCase());
      if (!char) continue;
      if (!isGroundedTerm(char.name, sceneNarration)) continue;
      updated = this.advanceVitality(updated, char.name, 'better');
      if (heal.what) {
        updated = {
          ...updated,
          characters: updated.characters.map((c) =>
            c.name.toLowerCase() === char.name.toLowerCase()
              ? { ...c, conditions: (c.conditions ?? []).filter((cond) => cond.toLowerCase() !== heal.what!.toLowerCase()) }
              : c,
          ),
        };
      }
      this.logger.info('[Cena] cura aplicada', { charName: char.name, what: heal.what });
    }

    return updated;
  }
}

/** Evidência explícita de morte na prosa (sem isso, `caído` ≠ `dead`). */
const DEATH_EVIDENCE = /morreu|morte|matou|assassin|faleceu|pereceu|morta|morto|sem vida|corpo sem vida/i;
/** Evidência explícita de perda na prosa. */
const LOSS_EVIDENCE = /sumiu|desapareceu|perdeu-se|neblina.*engoliu|foi levado|partiu para (longe|nunca mais)|desaparecimento/i;
