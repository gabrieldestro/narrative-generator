import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface LlmConnectionOptions {
  apiUrl?: string | undefined;
  model?: string | undefined;
  apiToken?: string | undefined;
}

/**
 * Aplica a conexão LLM (URL/modelo/token vindos da tela de configurações)
 * no `ChatOpenAI` compartilhado, por mutação in-place.
 *
 * Por que mutação e não recriação: todos os agentes (`LlmClient`,
 * `SelfHealingService`, narrador, extratores…) guardam a mesma referência
 * do modelo construída no boot (`server.ts`). Recriar quebraria essas
 * referências; mutar `model/apiKey/clientConfig` preserva e vale para as
 * próximas chamadas (`client` OpenAI é lazy + `clientConfig` é lido por
 * chamada em `@langchain/openai@1.5`).
 *
 * Limitação conhecida: global do servidor — o último request vence para
 * todas as sessões (sem isolamento por campanha).
 */
export function applyLlmConnection(
  llmModel: BaseChatModel,
  opts: LlmConnectionOptions,
  logger?: { info: (msg: string, meta?: unknown) => void },
): boolean {
  const target = llmModel as unknown as Record<string, unknown>;
  let changed = false;

  if (typeof opts.model === 'string' && opts.model.trim().length > 0) {
    const nextModel = opts.model.trim();
    if (target['model'] !== nextModel) {
      target['model'] = nextModel;
      changed = true;
    }
  }

  if (typeof opts.apiToken === 'string' && opts.apiToken.length > 0) {
    if (target['apiKey'] !== opts.apiToken) {
      target['apiKey'] = opts.apiToken;
      changed = true;
    }
    const clientConfig = target['clientConfig'] as Record<string, unknown> | undefined;
    if (clientConfig && clientConfig['apiKey'] !== opts.apiToken) {
      clientConfig['apiKey'] = opts.apiToken;
      changed = true;
    }
  }

  if (typeof opts.apiUrl === 'string' && opts.apiUrl.trim().length > 0) {
    const nextUrl = opts.apiUrl.trim().replace(/\/+$/, '');
    const clientConfig = target['clientConfig'] as Record<string, unknown> | undefined;
    if (clientConfig) {
      if (clientConfig['baseURL'] !== nextUrl) {
        clientConfig['baseURL'] = nextUrl;
        changed = true;
      }
    } else if ((target['configuration'] as Record<string, unknown> | undefined)?.['baseURL'] !== nextUrl) {
      const configuration = target['configuration'] as Record<string, unknown> | undefined;
      if (configuration) {
        configuration['baseURL'] = nextUrl;
        changed = true;
      }
    }
    // Se o client OpenAI já foi materializado, atualiza também para não
    // manter a URL antiga em chamadas subsequentes.
    const client = target['client'] as Record<string, unknown> | undefined;
    if (client && typeof client['baseURL'] === 'string' && client['baseURL'] !== nextUrl) {
      client['baseURL'] = nextUrl;
      changed = true;
    }
  }

  if (changed) {
    logger?.info('[LLM] conexão atualizada via settings', {
      model: opts.model,
      apiUrl: opts.apiUrl,
      hasToken: typeof opts.apiToken === 'string' && opts.apiToken.length > 0,
    });
  }
  return changed;
}
