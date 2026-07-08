import type { GameState, Character, Location, CharacterStatus } from "../domain/types.js";
import type { LlmService } from "./LlmService.js";

export class GameManagementService {
  constructor(private readonly llmService: LlmService) {}

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
    const characters = state.characters.map((c) => {
      if (c.name.toLowerCase() === charName.toLowerCase()) {
        return { ...c, status };
      }
      return c;
    });

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

    return { ...state, characters };
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
            // Se já existia mas estava inativo, ativa novamente
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

    return updatedState;
  }
}
