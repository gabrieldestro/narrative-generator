import { describe, it, expect } from "vitest";
import { GameManagementService } from "../GameManagementService.js";
import type { GameState } from "../../domain/types.js";
import type { LlmService } from "../LlmService.js";

// Fusão dos deltas do step por categoria.
describe("GameManagementService.applyStepUpdates", () => {
  const mockLlmService = {} as unknown as LlmService;

  const createState = (): GameState => ({
    narrativeStyle: "Fantasia",
    writingStyle: "Épico",
    worldContext: "Pátio.",
    turnNumber: 2,
    history: [],
    characters: [
      {
        id: "1", name: "Darian", description: "Guerreiro", personality: "Bravo",
        isPlayer: true, currentLocation: "Pátio", inventory: ["Espada"], status: "active",
      },
      {
        id: "2", name: "Elara", description: "Elfa", personality: "Sábia",
        isPlayer: false, currentLocation: "Pátio", inventory: [], status: "active",
      },
    ],
    locations: [
      { id: "patio", name: "Pátio", description: "Aberto", connectedTo: [] },
      { id: "porao", name: "Porão", description: "Úmido", connectedTo: [] },
    ],
  });

  it("aplica grab com grounding + dedup, descarta sem citação e nome inválido", () => {
    const service = new GameManagementService(mockLlmService);
    const narration = "Elara pega a Chave de Bronze sobre a mesa.";
    const out = service.applyStepUpdates(createState(), narration, {
      inventory: {
        grab: [
          { who: "Elara", item: "Chave de Bronze" },
          { who: "Elara", item: "Adaga Oculta" }, // sem citação → descarta
          { who: "Fantasma", item: "Chave de Bronze" }, // nome inválido → descarta
        ],
        drop: [],
      },
    });
    const elara = out.state.characters.find((c) => c.name === "Elara")!;
    expect(elara.inventory).toEqual(["Chave de Bronze"]);
    expect(out.pendingMoves).toEqual([]);
  });

  it("grab duplicado (case-insensitive) não duplica", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applyStepUpdates(createState(), "Darian empunha a espada.", {
      inventory: { grab: [{ who: "Darian", item: "espada" }] },
    });
    expect(out.state.characters.find((c) => c.name === "Darian")!.inventory).toEqual(["Espada"]);
  });

  it("aplica drop e move para local existente", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applyStepUpdates(createState(), "Darian larga a Espada e desce ao Porão.", {
      inventory: { drop: [{ who: "Darian", item: "Espada" }] },
      movement: { move: [{ who: "Darian", to: "Porão" }] },
    });
    const darian = out.state.characters.find((c) => c.name === "Darian")!;
    expect(darian.inventory).toEqual([]);
    expect(darian.currentLocation).toBe("Porão");
    expect(out.pendingMoves).toEqual([]);
  });

  it("move para nome desconhecido vira `pendingMoves` (não aplica, sem stale)", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applyStepUpdates(createState(), "Elara sobe ao Sótão escuro.", {
      movement: { move: [{ who: "Elara", to: "Sótão" }] },
    });
    expect(out.state.characters.find((c) => c.name === "Elara")!.currentLocation).toBe("Pátio");
    expect(out.pendingMoves).toEqual([{ who: "Elara", to: "Sótão" }]);
  });

  it("aplica conditions com grounding, dedup e teto de 3", () => {
    const service = new GameManagementService(mockLlmService);
    const state = createState();
    state.characters[0]!.conditions = ["corte no braço", "ombro deslocado", "tornozelo torcido"];
    const out = service.applyStepUpdates(state, "Darian cai do muro e torce o tornozelo, o sangue escorre do corte no braço.", {
      conditions: {
        conditions: [
          { who: "Darian", add: "tornozelo torcido" }, // dedup → ignora
          { who: "Darian", add: "fratura exposta" }, // teto 3 → ignora
          { who: "Darian", add: "Adaga Oculta" }, // sem grounding → ignora (não está na narração)
        ],
      },
    });
    expect(out.state.characters.find((c) => c.name === "Darian")!.conditions).toEqual([
      "corte no braço", "ombro deslocado", "tornozelo torcido",
    ]);
  });

  it("`{}` válido em toda categoria (nada muda)", () => {
    const service = new GameManagementService(mockLlmService);
    const before = createState();
    const out = service.applyStepUpdates(before, "Eles conversam sobre o tempo.", {
      inventory: {}, movement: {}, conditions: {},
    });
    expect(out.state.characters).toEqual(before.characters);
    expect(out.pendingMoves).toEqual([]);
  });

  it("JSON misto (1 válido + 2 inválidos) aplica só o válido", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applyStepUpdates(createState(), "Elara pega a Chave de Bronze e desce ao Porão.", {
      inventory: { grab: [{ who: "Elara", item: "Chave de Bronze" }] },
      movement: { move: [{ who: "Fantasma", to: "Porão" }] }, // nome inválido
      conditions: { conditions: [{ who: "Elara", add: "Asa Quebrada" }] }, // sem grounding
    });
    expect(out.state.characters.find((c) => c.name === "Elara")!.inventory).toEqual(["Chave de Bronze"]);
    expect(out.state.characters.find((c) => c.name === "Elara")!.currentLocation).toBe("Pátio");
    expect(out.state.characters.find((c) => c.name === "Elara")!.conditions ?? []).toEqual([]);
  });

  it("morte via step é ignorada (só via cena-extrator)", () => {
    const service = new GameManagementService(mockLlmService);
    // Não há campo de lifecycle nos deltas: estado vital permanece.
    const out = service.applyStepUpdates(createState(), "Darian cai.", { conditions: {} });
    expect(out.state.characters.find((c) => c.name === "Darian")!.status ?? "active").toBe("active");
    expect(out.state.characters.find((c) => c.name === "Darian")!.vitality ?? "ileso").toBe("ileso");
  });
});

// Vitalidade + fusão de cena.
describe("GameManagementService.advanceVitality", () => {
  const mockLlmService = {} as unknown as LlmService;

  const createState = (): GameState => ({
    narrativeStyle: "Fantasia",
    writingStyle: "Épico",
    worldContext: "Pátio.",
    turnNumber: 3,
    history: [],
    characters: [
      { id: "1", name: "Darian", description: "G", personality: "B", isPlayer: true, currentLocation: "Pátio", vitality: "ileso", status: "active" },
      { id: "2", name: "Elara", description: "E", personality: "S", isPlayer: false, currentLocation: "Pátio", vitality: "grave", status: "active" },
    ],
    locations: [],
  });

  it("piora 1 nível sem pular; não passa de caído", () => {
    const service = new GameManagementService(mockLlmService);
    let state = service.advanceVitality(createState(), "Darian", "worse");
    expect(state.characters.find((c) => c.name === "Darian")!.vitality).toBe("ferido");
    state = service.advanceVitality(state, "Darian", "worse");
    expect(state.characters.find((c) => c.name === "Darian")!.vitality).toBe("grave");
    state = service.advanceVitality(state, "Darian", "worse");
    expect(state.characters.find((c) => c.name === "Darian")!.vitality).toBe("caído");
    state = service.advanceVitality(state, "Darian", "worse");
    expect(state.characters.find((c) => c.name === "Darian")!.vitality).toBe("caído");
  });

  it("melhora 1 nível (só via cura explícita); nome desconhecido não faz nada", () => {
    const service = new GameManagementService(mockLlmService);
    const state = service.advanceVitality(createState(), "Elara", "better");
    expect(state.characters.find((c) => c.name === "Elara")!.vitality).toBe("ferido");
    expect(service.advanceVitality(createState(), "Fantasma", "worse").characters).toHaveLength(2);
  });
});

describe("GameManagementService.applySceneUpdates", () => {
  const mockLlmService = {} as unknown as LlmService;

  const createState = (): GameState => ({
    narrativeStyle: "Fantasia",
    writingStyle: "Épico",
    worldContext: "Pátio.",
    turnNumber: 3,
    history: [],
    characters: [
      { id: "1", name: "Darian", description: "G", personality: "B", isPlayer: true, currentLocation: "Pátio", vitality: "ferido", conditions: ["corte no braço"], status: "active" },
      { id: "2", name: "Vulto", description: "S", personality: "?", isPlayer: false, currentLocation: "Sótão", vitality: "ileso", status: "active" },
    ],
    locations: [{ id: "patio", name: "Pátio", description: "Aberto", connectedTo: [] }],
  });

  it("cria local com id slugificado (nunca do LLM) e NPC com defaults", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applySceneUpdates(
      createState(),
      "Eles sobem ao Sótão escuro, onde o Vulto os encara. Elara surge da escada.",
      {
        new_locations: [{ name: "Sótão", desc: "Escuro" }],
        new_npcs: [{ name: "Elara", desc: "Elfa", where: "Sótão" }],
        dead: [], lost: [], healed: [],
      },
    );
    expect(out.locations!.find((l) => l.id === "sotao")!.name).toBe("Sótão");
    const elara = out.characters.find((c) => c.name === "Elara")!;
    expect(elara.vitality).toBe("ileso");
    expect(elara.status).toBe("active");
    expect(elara.inventory).toEqual([]);
  });

  it("ignora local/NPC sem grounding e duplicados", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applySceneUpdates(
      createState(),
      "Nada de novo no Pátio.",
      {
        new_locations: [
          { name: "Biblioteca", desc: "x" }, // sem citação
          { name: "Pátio", desc: "y" }, // duplicado (id patio)
        ],
        new_npcs: [{ name: "Darian", desc: "x", where: "Pátio" }], // nome existente
        dead: [], lost: [], healed: [],
      },
    );
    expect(out.locations).toHaveLength(1);
    expect(out.characters).toHaveLength(2);
  });

  it("dead/lost só com evidência explícita; caído não vira dead sozinho", () => {
    const service = new GameManagementService(mockLlmService);
    const fallen = createState();
    fallen.characters.find((c) => c.name === "Vulto")!.vitality = "caído";

    const withoutEvidence = service.applySceneUpdates(fallen, "O Vulto jaz caído no Sótão.", {
      new_locations: [], new_npcs: [], dead: ["Vulto"], lost: [], healed: [],
    });
    expect(withoutEvidence.characters.find((c) => c.name === "Vulto")!.status).toBe("active");

    const withEvidence = service.applySceneUpdates(fallen, "O Vulto morreu no Sótão, sem vida.", {
      new_locations: [], new_npcs: [], dead: ["Vulto"], lost: [], healed: [],
    });
    expect(withEvidence.characters.find((c) => c.name === "Vulto")!.status).toBe("dead");

    const lost = service.applySceneUpdates(createState(), "Darian sumiu na neblina.", {
      new_locations: [], new_npcs: [], dead: [], lost: ["Darian"], healed: [],
    });
    expect(lost.characters.find((c) => c.name === "Darian")!.status).toBe("lost");
  });

  it("healed volta 1 nível e remove a condição citada", () => {
    const service = new GameManagementService(mockLlmService);
    const out = service.applySceneUpdates(
      createState(),
      "Elara cura Darian: o corte no braço se fecha.",
      { new_locations: [], new_npcs: [], dead: [], lost: [], healed: [{ who: "Darian", what: "corte no braço" }] },
    );
    const darian = out.characters.find((c) => c.name === "Darian")!;
    expect(darian.vitality).toBe("ileso");
    expect(darian.conditions ?? []).toEqual([]);
  });
});
