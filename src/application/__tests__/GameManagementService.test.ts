import { describe, it, expect, vi } from "vitest";
import { GameManagementService } from "../GameManagementService.js";
import type { GameState, Character, Location } from "../../domain/types.js";
import type { LlmService } from "../LlmService.js";

describe("GameManagementService", () => {
  const mockLlmService = {
    extractStateChanges: vi.fn(),
  } as unknown as LlmService;

  const createInitialState = (): GameState => ({
    narrativeStyle: "Fantasia",
    writingStyle: "Épico",
    worldContext: "Um reino distante.",
    turnNumber: 1,
    history: [],
    characters: [
      {
        id: "1",
        name: "Elias",
        description: "Guerreiro",
        personality: "Corajoso",
        isPlayer: true,
        currentLocation: "Taverna",
        inventory: ["Espada"],
        status: "active",
      },
    ],
    locations: [
      {
        id: "taverna",
        name: "Taverna do Dragão",
        description: "Local aconchegante",
        connectedTo: ["floresta"],
      },
      {
        id: "floresta",
        name: "Floresta Escura",
        description: "Árvores altas",
        connectedTo: ["taverna"],
      },
    ],
  });

  it("should add a character successfully", () => {
    const service = new GameManagementService(mockLlmService);
    const state = createInitialState();

    const newState = service.addCharacter(state, {
      name: "Morgana",
      description: "Maga",
      personality: "Misteriosa",
      currentLocation: "Taverna",
      inventory: ["Cajado"],
      status: "active",
    });

    expect(newState.characters).toHaveLength(2);
    expect(newState.characters.find((c) => c.name === "Morgana")).toBeDefined();
  });

  it("should set character status successfully", () => {
    const service = new GameManagementService(mockLlmService);
    const state = createInitialState();

    const newState = service.setCharacterStatus(state, "Elias", "dead");
    const elias = newState.characters.find((c) => c.name === "Elias");

    expect(elias?.status).toBe("dead");
  });

  it("should add item to character inventory", () => {
    const service = new GameManagementService(mockLlmService);
    const state = createInitialState();

    const newState = service.addItemToCharacter(state, "Elias", "Poção");
    const elias = newState.characters.find((c) => c.name === "Elias");

    expect(elias?.inventory).toContain("Poção");
  });

  it("should remove item from character inventory", () => {
    const service = new GameManagementService(mockLlmService);
    const state = createInitialState();

    const newState = service.removeItemFromCharacter(state, "Elias", "Espada");
    const elias = newState.characters.find((c) => c.name === "Elias");

    expect(elias?.inventory).not.toContain("Espada");
  });

  it("should apply automatic state updates correctly", async () => {
    const service = new GameManagementService(mockLlmService);
    const state = createInitialState();

    vi.mocked(mockLlmService.extractStateChanges).mockResolvedValueOnce({
      inventoryChanges: [
        { characterName: "Elias", action: "add", item: "Chave de Bronze" },
        { characterName: "Elias", action: "remove", item: "Espada" },
      ],
      locationChanges: {
        discovered: [
          {
            id: "caverna",
            name: "Caverna Sombria",
            description: "Cheia de morcegos.",
            connectedTo: ["floresta"],
          },
        ],
        newConnections: [{ from: "floresta", to: "caverna" }],
      },
      characterLifecycle: [
        { characterName: "Morgana", status: "discovered", description: "Maga paranormal.", personality: "Fria.", location: "taverna" },
        { characterName: "Elias", status: "lost" },
      ],
    });

    const newState = await service.applyAutomaticStateUpdates(state, "Elias perdeu sua espada e encontrou uma chave. Morgana apareceu na taverna. Elias correu para a neblina e sumiu.");

    const elias = newState.characters.find((c) => c.name === "Elias");
    const morgana = newState.characters.find((c) => c.name === "Morgana");
    const caverna = newState.locations.find((l) => l.id === "caverna");
    const floresta = newState.locations.find((l) => l.id === "floresta");

    expect(elias?.inventory).toContain("Chave de Bronze");
    expect(elias?.inventory).not.toContain("Espada");
    expect(elias?.status).toBe("lost");

    expect(morgana).toBeDefined();
    expect(morgana?.status).toBe("active");
    expect(morgana?.currentLocation).toBe("taverna");

    expect(caverna).toBeDefined();
    expect(floresta?.connectedTo).toContain("caverna");
    expect(caverna?.connectedTo).toContain("floresta");
  });
});
