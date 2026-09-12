import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
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

export interface LlmStreamOptions {
  agent?: string;
  turn?: number;
  onToken?: (token: string) => void;
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

  /**
   * Streaming com os mesmos registros de log do `LlmService.narrateFiction`
   * (doc 27, Fase 1): consome o stream até o fim, emite `onToken` por chunk
   * e registra `callLogger` (success) + `contentLogger`. Erros propagam
   * intocados — o chamador (ex: `NarratorAgent.narrateLegacy`) decide o
   * fallback de overflow, como no legado.
   */
  async stream(systemPrompt: string, humanPrompt: string, opts: LlmStreamOptions = {}): Promise<string> {
    return this.streamMessages(
      [new SystemMessage(systemPrompt), new HumanMessage(humanPrompt)],
      opts,
    );
  }

  async streamMessages(messages: BaseMessage[], opts: LlmStreamOptions = {}): Promise<string> {
    const agent = opts.agent ?? 'llm';
    const turn = opts.turn ?? 0;
    const start = Date.now();
    const fullPrompt = messages.map((m) => String(m.content)).join('\n');

    const stream = await this.llm.stream(messages);
    let fullResponse = '';
    for await (const chunk of stream) {
      const text = chunk.content as string;
      fullResponse += text;
      opts.onToken?.(text);
    }

    this.callLogger?.record({
      timestamp: new Date().toISOString(),
      agent,
      turnNumber: turn,
      durationMs: Date.now() - start,
      attempt: 1,
      status: 'success',
    });
    this.contentLogger?.record({
      timestamp: new Date().toISOString(),
      turnNumber: turn,
      agent,
      fullPrompt,
      fullResponse,
      status: 'success',
      durationMs: Date.now() - start,
    });

    return fullResponse;
  }
}
