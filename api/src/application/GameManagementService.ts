import type { GameState, Character, Location, CharacterStatus } from "../domain/types.js";
import type { LlmService } from "./LlmService.js";
import type { ILogger } from "../domain/ports.js";

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

    this.logger.info('[StateUpdate] alterações aplicadas', {
      inventoryChanges: changes.inventoryChanges?.length ?? 0,
      lifecycleChanges: changes.characterLifecycle?.length ?? 0,
      locationChanges: changes.locationChanges?.discovered?.length ?? 0,
    });

    return updatedState;
  }
}
