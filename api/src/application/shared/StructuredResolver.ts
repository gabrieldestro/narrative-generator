import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LlmCallLogger } from "../../infrastructure/logging/LlmCallLogger.js";
import type { LlmContentLogger } from "../../infrastructure/logging/LlmContentLogger.js";
import type { ILogger } from "../../domain/ports.js";
import type { GameSettings } from "../../domain/types.js";
import { SelfHealingService } from "./selfHealing/SelfHealingService.js";

export interface ResolveJsonOptions {
  agent: string;
  turn: number;
  system: string;
  human: string;
  schemaSpec: string;
  validate: (v: unknown) => boolean;
  /** Compactação do repair (reduz itens se truncado). Default true p/ extratores. */
  compact?: boolean;
}

/**
 * Saída estruturada atrás de interface fina (doc 27, Fase 0 — §7.2).
 * JSON puro via prompt é o default do MVP; tool-call futuro = outra
 * implementação desta interface, sem tocar orquestrador nem validadores.
 */
export interface IStructuredResolver {
  resolveJson(opts: ResolveJsonOptions): Promise<{ value: unknown; attempt: number } | null>;
}

/**
 * Default do MVP: prompt + `SelfHealingService.parseWithRepair`.
 * Falha após repair → retorna `null`; o AGENTE decide o fallback
 * (`{}` ou parcial), nunca o resolver.
 */
export class PromptJsonResolver implements IStructuredResolver {
  private readonly selfHealing: SelfHealingService;

  constructor(
    private readonly llm: BaseChatModel,
    private readonly callLogger?: LlmCallLogger,
    appLogger?: ILogger,
    settings: Partial<GameSettings> = {},
    private readonly contentLogger?: LlmContentLogger,
  ) {
    // Reuso: o repair usa os mesmos settings (maxHealRetries,
    // jsonRepairMaxInputChars) já centralizados no SelfHealingService.
    this.selfHealing = new SelfHealingService(llm, callLogger, appLogger, settings);
  }

  async resolveJson(opts: ResolveJsonOptions): Promise<{ value: unknown; attempt: number } | null> {
    const raw = await this.invoke(opts.agent, opts.turn, opts.system, opts.human);
    const healed = await this.selfHealing.parseWithRepair({
      agent: opts.agent,
      turn: opts.turn,
      raw,
      schemaSpec: opts.schemaSpec,
      validate: opts.validate,
      compact: opts.compact ?? true,
    });
    if (!healed) return null;
    return { value: healed.value, attempt: healed.attempt };
  }

  private async invoke(agent: string, turn: number, system: string, human: string): Promise<string> {
    const messages = [new SystemMessage(system), new HumanMessage(human)];
    const doInvoke = () => {
      if (this.callLogger) {
        return this.callLogger.measure(agent, turn, () => this.llm.invoke(messages));
      }
      return this.llm.invoke(messages);
    };
    // Mesmo comportamento de `LlmService.invokePrompts`: log de conteúdo do prompt.
    if (this.contentLogger) {
      const fullPrompt = system + '\n' + human;
      const response = await this.contentLogger.measure(agent, turn, fullPrompt, doInvoke);
      return response.content as string;
    }
    const response = await doInvoke();
    return response.content as string;
  }
}
