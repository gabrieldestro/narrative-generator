import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { ILogger } from "../../domain/ports.js";
import type { LlmCallLogger } from "../../infrastructure/LlmCallLogger.js";
import type { LlmContentLogger } from "../../infrastructure/LlmContentLogger.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export interface LlmInvokeOptions {
  agent?: string;
  turn?: number;
  attempt?: number;
  /** Temperatura por chamada (doc 27, §3). Nem todo backend honra por invoke
   * (ex: LM Studio) — a Fase 1 valida se precisa de factory `(temp)=>model`. */
  temperature?: number;
}

/**
 * Wrapper fino sobre o `BaseChatModel` (doc 27, Fase 0 — §7.2).
 * Único dono do modelo dentro do pacote `llm/`; agentes nunca chamam
 * `llm.invoke` direto. Preserva os loggers existentes (`LlmCallLogger` +
 * `LlmContentLogger`) com o mesmo comportamento do `LlmService.invokePrompts`.
 */
export class LlmClient {
  private readonly appLogger: ILogger;

  constructor(
    private readonly llm: BaseChatModel,
    private readonly callLogger?: LlmCallLogger,
    appLogger?: ILogger,
    private readonly contentLogger?: LlmContentLogger,
  ) {
    this.appLogger = appLogger ?? new NullLogger();
  }

  async invoke(systemPrompt: string, humanPrompt: string, opts: LlmInvokeOptions = {}): Promise<string> {
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(humanPrompt)];
    const agent = opts.agent ?? 'llm';
    const turn = opts.turn ?? 0;
    const attempt = opts.attempt ?? 1;

    const doInvoke = () => {
      if (this.callLogger) {
        return this.callLogger.measure(agent, turn, () => this.llm.invoke(messages), attempt);
      }
      return this.llm.invoke(messages);
    };

    if (this.contentLogger) {
      const fullPrompt = systemPrompt + '\n' + humanPrompt;
      const response = await this.contentLogger.measure(agent, turn, fullPrompt, doInvoke);
      return response.content as string;
    }

    const response = await doInvoke();
    return response.content as string;
  }
}
