import type { GameState, Character, Location, Concept } from "../domain/types.js";
import type { ILogger } from "../domain/ports.js";
import type { GameManagementService } from "./GameManagementService.js";
import type { LlmService } from "./LlmService.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export interface AdminCommandParams {
  command: string;
  args?: string[];
  fields?: Record<string, unknown>;
  collectFields?: (field: string, prompt: string) => Promise<string>;
}

export interface AdminCommandResult {
  state: GameState;
  message: string;
  payload?: unknown;
}

export class AdminCommandService {
  private readonly logger: ILogger;

  constructor(
    private readonly gameManagementService: GameManagementService,
    private readonly llmService?: LlmService,
    logger?: ILogger
  ) {
    this.logger = logger ?? new NullLogger();
  }

  public getHelpText(): string {
    return [
      "--- Comandos Administrativos Disponíveis ---",
      "/help - Mostra este menu de ajuda.",
      "/observe <detalhe da cena> - Detalha/observa um aspecto da cena sem avançar o turno.",
      "/narrate <narração declarada> - Força o narrador a narrar o que você declarou e resolve o estado do mundo, sem avançar o turno.",
      "/status ou /chars - Mostra os personagens, locais, inventários e status.",
      "/map - Mostra o mapa de localizações conhecidas.",
      "/concepts - Mostra a lista de conceitos abstratos conhecidos do mundo.",
      "/add-item <personagem> <item> - Adiciona um item ao inventário.",
      "/remove-item <personagem> <item> - Remove um item do inventário.",
      "/add-char - Cria interativamente um novo personagem.",
      "/remove-char <personagem> - Marca o personagem como perdido ('lost').",
      "/add-location - Adiciona manualmente uma localização ao mapa.",
      "/remove-location <id> - Remove uma localização do mapa pelo ID.",
      "/add-concept - Adiciona manualmente um conceito abstrato do mundo.",
      "/remove-concept <id> - Remove um conceito abstrato pelo ID.",
      "/extract - Extrai mudanças de estado da última narrativa automaticamente.",
      "/extract-char - Gera ficha de um personagem a partir do histórico via LLM."
    ].join("\n");
  }

  public async execute(state: GameState, params: AdminCommandParams): Promise<AdminCommandResult> {
    const rawCommand = (params.command || "").trim().toLowerCase();
    const command = rawCommand.startsWith("/") ? rawCommand : `/${rawCommand}`;
    const args = params.args ?? [];
    const fields = params.fields ?? {};
    const collect = params.collectFields;

    this.logger.info("Executando comando administrativo", { command, argsCount: args.length });

    switch (command) {
      case "/help": {
        return {
          state,
          message: this.getHelpText()
        };
      }

      case "/status":
      case "/chars": {
        const lines: string[] = ["--- Status dos Personagens ---"];
        for (const char of state.characters) {
          lines.push(`- ${char.name} [Status: ${char.status || "active"}]`);
          lines.push(`  Local: ${char.currentLocation || "Desconhecido"}`);
          lines.push(`  Inventário: [${char.inventory ? char.inventory.join(", ") : ""}]`);
          lines.push(`  Descrição: ${char.description}`);
        }
        return {
          state,
          message: lines.join("\n")
        };
      }

      case "/map": {
        const lines: string[] = ["--- Mapa de Localizações ---"];
        if (!state.locations || state.locations.length === 0) {
          lines.push("(Sem localizações cadastradas)");
        } else {
          for (const loc of state.locations) {
            lines.push(`- ${loc.name} (ID: ${loc.id})`);
            lines.push(`  Descrição: ${loc.description}`);
            lines.push(`  Conexões: [${loc.connectedTo.join(", ")}]`);
          }
        }
        return {
          state,
          message: lines.join("\n")
        };
      }

      case "/concepts": {
        const lines: string[] = ["--- Conceitos Abstratos do Mundo ---"];
        if (!state.concepts || state.concepts.length === 0) {
          lines.push("(Sem conceitos abstratos cadastrados)");
        } else {
          const typeLabels: Record<string, string> = {
            item: "Item",
            faction: "Facção",
            state: "Estado/Nação",
            region: "Região",
            place: "Lugar",
            custom: "Conceito"
          };
          for (const c of state.concepts) {
            const label = typeLabels[c.type] || "Conceito";
            lines.push(`- [${label}] ${c.name} (ID: ${c.id})`);
            lines.push(`  Descrição: ${c.description}`);
          }
        }
        return {
          state,
          message: lines.join("\n")
        };
      }

      case "/add-item": {
        let charName = (fields.characterName as string) || (fields.charName as string);
        let item = (fields.item as string) || (fields.itemName as string);

        if ((!charName || !item) && args.length >= 2) {
          charName = args[0]!;
          item = args.slice(1).join(" ");
        }

        if (!charName || !item) {
          return {
            state,
            message: "Uso: /add-item <personagem> <nome do item>"
          };
        }

        const updated = this.gameManagementService.addItemToCharacter(state, charName, item);
        return {
          state: updated,
          message: `Item "${item}" adicionado ao inventário de ${charName}.`
        };
      }

      case "/remove-item": {
        let charName = (fields.characterName as string) || (fields.charName as string);
        let item = (fields.item as string) || (fields.itemName as string);

        if ((!charName || !item) && args.length >= 2) {
          charName = args[0]!;
          item = args.slice(1).join(" ");
        }

        if (!charName || !item) {
          return {
            state,
            message: "Uso: /remove-item <personagem> <nome do item>"
          };
        }

        const updated = this.gameManagementService.removeItemFromCharacter(state, charName, item);
        return {
          state: updated,
          message: `Item "${item}" removido do inventário de ${charName}.`
        };
      }

      case "/add-char": {
        let name = (fields.name as string) || "";
        let description = (fields.description as string) || "";
        let personality = (fields.personality as string) || "";
        let location = (fields.location as string) || (fields.currentLocation as string) || "";

        if (!name && collect) {
          name = await collect("name", "Nome do novo personagem: ");
          description = await collect("description", "Descrição: ");
          personality = await collect("personality", "Personalidade: ");
          location = await collect("location", "Localização inicial: ");
        }

        if (!name || !name.trim()) {
          return {
            state,
            message: "Nome inválido. Operação cancelada."
          };
        }

        const updated = this.gameManagementService.addCharacter(state, {
          name: name.trim(),
          description: description.trim(),
          personality: personality.trim(),
          currentLocation: location.trim(),
          isPlayer: false,
          inventory: [],
          status: "active"
        });

        return {
          state: updated,
          message: `Personagem "${name.trim()}" adicionado com sucesso!`
        };
      }

      case "/remove-char": {
        let charName = (fields.characterName as string) || (fields.name as string);
        if (!charName && args.length >= 1) {
          charName = args.join(" ");
        }

        if (!charName || !charName.trim()) {
          return {
            state,
            message: "Uso: /remove-char <personagem>"
          };
        }

        const updated = this.gameManagementService.setCharacterStatus(state, charName.trim(), "lost");
        return {
          state: updated,
          message: `Personagem "${charName.trim()}" marcado como perdido (lost).`
        };
      }

      case "/add-location": {
        let id = (fields.id as string) || "";
        let name = (fields.name as string) || "";
        let description = (fields.description as string) || "";
        let connectedTo: string[] = Array.isArray(fields.connectedTo) ? (fields.connectedTo as string[]) : [];

        if (!id && collect) {
          id = await collect("id", "ID único do local (ex: biblioteca, poco_fundo): ");
          if (!id || !id.trim()) {
            return {
              state,
              message: "ID inválido. Operação cancelada."
            };
          }
          name = await collect("name", "Nome do local: ");
          description = await collect("description", "Descrição breve: ");
          const locConnRaw = await collect("connectedTo", "IDs dos locais conectados (separados por vírgula, ou vazio): ");
          connectedTo = locConnRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }

        if (!id || !id.trim()) {
          return {
            state,
            message: "ID de localização obrigatório."
          };
        }

        const updated = this.gameManagementService.addLocation(state, {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          connectedTo
        });

        let msg = `Local "${name.trim()}" (ID: ${id.trim()}) adicionado ao mapa com sucesso!`;
        if (connectedTo.length > 0) {
          msg += `\n  Conexões bidirecionais criadas com: [${connectedTo.join(", ")}]`;
        }

        return {
          state: updated,
          message: msg
        };
      }

      case "/remove-location": {
        let locationId = (fields.id as string) || "";
        if (!locationId && args.length >= 1) {
          locationId = args[0]!;
        }

        if (!locationId || !locationId.trim()) {
          return {
            state,
            message: "Uso: /remove-location <id_do_local>\nDica: use /map para ver os IDs disponíveis."
          };
        }

        const existingLoc = (state.locations ?? []).find((l) => l.id === locationId.trim());
        if (!existingLoc) {
          return {
            state,
            message: `Local com ID "${locationId.trim()}" não encontrado. Use /map para ver os IDs disponíveis.`
          };
        }

        const updated = this.gameManagementService.removeLocation(state, locationId.trim());
        return {
          state: updated,
          message: `Local "${existingLoc.name}" (ID: ${locationId.trim()}) removido do mapa.\n  Referências nos demais locais foram limpas automaticamente.`
        };
      }

      case "/add-concept": {
        let id = (fields.id as string) || "";
        let type = ((fields.type as string) || "").trim().toLowerCase();
        let name = (fields.name as string) || "";
        let description = (fields.description as string) || "";
        const validTypes = ["item", "faction", "state", "region", "place", "custom"];

        if (!id && collect) {
          id = await collect("id", "ID único do conceito (ex: olhar_de_merlim, arasaka): ");
          if (!id || !id.trim()) {
            return {
              state,
              message: "ID inválido. Operação cancelada."
            };
          }
          const conceptTypeRaw = await collect("type", "Tipo (item, faction, state, region, place, custom): ");
          type = conceptTypeRaw.trim().toLowerCase();
          if (!validTypes.includes(type)) {
            return {
              state,
              message: `Tipo inválido "${type}". Deve ser um de: ${validTypes.join(", ")}. Operação cancelada.`
            };
          }
          name = await collect("name", "Nome do conceito: ");
          description = await collect("description", "Descrição breve: ");
        }

        if (!id || !id.trim()) {
          return {
            state,
            message: "ID de conceito obrigatório."
          };
        }

        if (!validTypes.includes(type)) {
          return {
            state,
            message: `Tipo inválido "${type}". Deve ser um de: ${validTypes.join(", ")}.`
          };
        }

        const updated = this.gameManagementService.addConcept(state, {
          id: id.trim(),
          type: type as any,
          name: name.trim(),
          description: description.trim()
        });

        return {
          state: updated,
          message: `Conceito "${name.trim()}" (ID: ${id.trim()}) adicionado com sucesso!`
        };
      }

      case "/remove-concept": {
        let conceptId = (fields.id as string) || "";
        if (!conceptId && args.length >= 1) {
          conceptId = args[0]!;
        }

        if (!conceptId || !conceptId.trim()) {
          return {
            state,
            message: "Uso: /remove-concept <id_do_conceito>\nDica: use /concepts para ver os IDs disponíveis."
          };
        }

        const existingConcept = (state.concepts ?? []).find((c) => c.id === conceptId.trim());
        if (!existingConcept) {
          return {
            state,
            message: `Conceito com ID "${conceptId.trim()}" não encontrado. Use /concepts para ver os IDs disponíveis.`
          };
        }

        const updated = this.gameManagementService.removeConcept(state, conceptId.trim());
        return {
          state: updated,
          message: `Conceito "${existingConcept.name}" (ID: ${conceptId.trim()}) removido.`
        };
      }

      case "/extract": {
        const lastNarrative = this.getLastNarrative(state.history);
        const updated = await this.gameManagementService.applyAutomaticStateUpdates(state, lastNarrative);
        return {
          state: updated,
          message: "Extração concluída e estado atualizado com sucesso!"
        };
      }

      case "/extract-char": {
        if (!this.llmService) {
          return {
            state,
            message: "Serviço LLM não configurado para extração."
          };
        }

        let charName = (fields.name as string) || (fields.charName as string) || "";
        let turnsCount = typeof fields.turnsCount === "number" ? fields.turnsCount : 0;

        if (!charName && collect) {
          charName = await collect("name", "Nome do personagem a extrair: ");
          if (!charName || !charName.trim()) {
            return {
              state,
              message: "Nome inválido. Operação cancelada."
            };
          }
          const turnsRaw = await collect(
            "turnsCount",
            `Quantos turnos do histórico analisar? (1-${state.history.length}, padrão = todos): `
          );
          turnsCount = parseInt(turnsRaw, 10);
        }

        if (!charName || !charName.trim()) {
          return {
            state,
            message: "Uso: /extract-char com o nome do personagem."
          };
        }

        const excerpt = isNaN(turnsCount) || turnsCount <= 0
          ? state.history.join("\n\n")
          : state.history.slice(-turnsCount).join("\n\n");

        const sheet = await this.llmService.extractCharacterFromHistory(
          charName.trim(),
          excerpt,
          state.narrativeStyle
        );

        if (!sheet) {
          return {
            state,
            message: `Não foi possível gerar a ficha de "${charName.trim()}". Tente adicionar manualmente.`
          };
        }

        return {
          state,
          message: `Ficha gerada com sucesso para "${sheet.name}".`,
          payload: { sheet }
        };
      }

      default:
        return {
          state,
          message: `Comando desconhecido: ${command}. Digite /help para ajuda.`
        };
    }
  }

  public getLastNarrative(history: string[]): string {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i]!;
      if (entry.includes("Narrativa Inicial:")) {
        return entry.substring(entry.indexOf("Narrativa Inicial:") + "Narrativa Inicial:".length).trim();
      }
      if (entry.includes("Narrativa:")) {
        return entry.substring(entry.indexOf("Narrativa:") + "Narrativa:".length).trim();
      }
      const turnMatch = entry.match(/^Turno \d+:\s*([\s\S]*)$/);
      if (turnMatch) {
        return turnMatch[1]!.trim();
      }
    }
    return "(Nenhuma narrativa encontrada no histórico)";
  }
}
