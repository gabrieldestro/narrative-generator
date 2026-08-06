import type { Character, CpuAgentDecision, GameState, ScratchpadEntry, GameSettings } from '../../domain/types.js';
import { DEFAULT_SETTINGS } from '../../domain/types.js';
import type { IOutputWriter, ILogger } from '../../domain/ports.js';
import type { LlmService } from '../LlmService.js';
import {
  cpuReflectionSystemPrompt,
  cpuReflectionHumanPrompt,
} from './CpuAgentPrompts.js';

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export class CpuReflectionService {
  private readonly settings: GameSettings;
  private readonly logger: ILogger;

  constructor(
    private readonly llmService: LlmService,
    settings: Partial<GameSettings> = {},
    logger?: ILogger,
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.logger = logger ?? new NullLogger();
  }

  async reflectAndAct(state: GameState, char: Character, output?: IOutputWriter, priorNpcActions?: string[]): Promise<CpuAgentDecision> {
    const systemPrompt = cpuReflectionSystemPrompt(state, char);
    const humanPrompt = cpuReflectionHumanPrompt(state, priorNpcActions);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.settings.maxCpuRetries; attempt++) {
      try {
        const agentLabel = `NPC:${char.name}`;
        const humanPromptFinal = attempt > 1
          ? `${humanPrompt}\n\nATENÇÃO: Sua resposta anterior não era um JSON válido. Responda APENAS com o JSON no formato especificado, sem texto extra.`
          : humanPrompt;
        const raw = await this.llmService.invokePrompts(systemPrompt, humanPromptFinal, agentLabel, state.turnNumber, attempt);

        const parsed = this.parseResponse(raw);

        char.currentObjective = parsed.updatedObjective;

        if (attempt > 1) {
          this.logger.warn('[NPC] retry bem-sucedido', { charName: char.name, attempt });
        }

        this.logger.info('[NPC] decisão', { charName: char.name, reasoning: parsed.reasoning, updatedObjective: parsed.updatedObjective, action: parsed.action });

        if (output && this.settings.maxCpuRetries > 0) {
          output.writeLine(`\x1b[90m[Raciocínio] ${char.name}: ${parsed.reasoning}\x1b[0m`);
        }

        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn('[NPC] retry por falha de parsing', { charName: char.name, attempt, rawError: lastError.message });
        if (output) {
          output.writeLine(`\x1b[91m[Agente] ${char.name}: tentativa ${attempt}/${this.settings.maxCpuRetries} falhou — ${lastError.message}\x1b[0m`);
        }
      }
    }

    this.logger.error('[NPC] falha após todas as tentativas', { charName: char.name, maxRetries: this.settings.maxCpuRetries });
    throw new Error(
      `CpuReflectionService.reflectAndAct falhou após ${this.settings.maxCpuRetries} tentativas para "${char.name}": ${lastError?.message}`,
    );
  }

  recordArbiterResult(char: Character, turn: number, logicalResolution: string): void {
    if (char.isPlayer) return;

    const objective = char.currentObjective ?? '(sem objetivo definido)';

    const escapedName = this.escapeRegex(char.name);
    const successMatch = logicalResolution.match(new RegExp(`${escapedName}.*?->\\s*Sucesso`, 'i'));
    const failMatch = logicalResolution.match(new RegExp(`${escapedName}.*?->\\s*Falha`, 'i'));

    let result: 'success' | 'failure';
    if (failMatch) {
      result = 'failure';
    } else if (successMatch) {
      result = 'success';
    } else {
      return;
    }

    const entry: ScratchpadEntry = {
      turn,
      objective,
      action: char.scratchpad?.[char.scratchpad.length - 1]?.action ?? '(ação desconhecida)',
      result,
      reasoning: '',
    };

    if (!char.scratchpad) {
      char.scratchpad = [];
    }
    char.scratchpad.push(entry);

    if (char.scratchpad.length > this.settings.maxScratchpadSize) {
      char.scratchpad = char.scratchpad.slice(-this.settings.maxScratchpadSize);
    }

    this.logger.info('[NPC] recordArbiterResult', { charName: char.name, resultado: result, turn });
  }

  private parseResponse(raw: string): CpuAgentDecision {
    const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
      throw new Error('campo "reasoning" ausente ou vazio');
    }
    if (typeof parsed.updatedObjective !== 'string' || parsed.updatedObjective.length === 0) {
      throw new Error('campo "updatedObjective" ausente ou vazio');
    }
    if (typeof parsed.action !== 'string' || parsed.action.length === 0) {
      throw new Error('campo "action" ausente ou vazio');
    }

    return {
      reasoning: parsed.reasoning,
      updatedObjective: parsed.updatedObjective,
      action: parsed.action,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
