import type { Character, CpuAgentDecision, GameState, ScratchpadEntry, GameSettings } from '../../domain/types.js';
import { DEFAULT_SETTINGS } from '../../domain/types.js';
import type { IOutputWriter } from '../../domain/ports.js';
import type { LlmService } from '../LlmService.js';
import {
  cpuReflectionSystemPrompt,
  cpuReflectionHumanPrompt,
} from './CpuAgentPrompts.js';

export class CpuReflectionService {
  private readonly settings: GameSettings;

  constructor(
    private readonly llmService: LlmService,
    settings: Partial<GameSettings> = {},
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async reflectAndAct(state: GameState, char: Character, output?: IOutputWriter): Promise<CpuAgentDecision> {
    const systemPrompt = cpuReflectionSystemPrompt(state, char);
    const humanPrompt = cpuReflectionHumanPrompt(state);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.settings.maxCpuRetries; attempt++) {
      try {
        const raw = await this.llmService.invokePrompts(systemPrompt, attempt > 1
          ? `${humanPrompt}\n\nATENÇÃO: Sua resposta anterior não era um JSON válido. Responda APENAS com o JSON no formato especificado, sem texto extra.`
          : humanPrompt,
        );

        const parsed = this.parseResponse(raw);

        char.currentObjective = parsed.updatedObjective;

        if (output && this.settings.maxCpuRetries > 0) {
          output.writeLine(`\x1b[90m[Raciocínio] ${char.name}: ${parsed.reasoning}\x1b[0m`);
        }

        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (output) {
          output.writeLine(`\x1b[91m[Agente] ${char.name}: tentativa ${attempt}/${this.settings.maxCpuRetries} falhou — ${lastError.message}\x1b[0m`);
        }
      }
    }

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
