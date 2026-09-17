import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILogger } from '../../domain/ports.js';
import { DEFAULT_SETTINGS } from '../../domain/types.js';
import { LlmClient } from '../shared/LlmClient.js';
import { PromptJsonResolver } from '../shared/StructuredResolver.js';
import { SelfHealingService } from '../shared/selfHealing/SelfHealingService.js';
import { ArbiterService } from './ArbiterService.js';
import { GateService } from './GateService.js';
import { NarratorService } from './NarratorService.js';
import { InventoryService } from './extractors/InventoryService.js';
import { MovementService } from './extractors/MovementService.js';
import { ConditionsService } from './extractors/ConditionsService.js';
import { SceneService } from './extractors/SceneService.js';
import { MemoryService } from './MemoryService.js';
import type { LlmService } from '../shared/LlmService.js';
import type { CharacterService } from '../characters/CharacterService.js';
import type { WorldService } from '../world/WorldService.js';
import { LlmCallLogger } from '../../infrastructure/logging/LlmCallLogger.js';
import { LlmContentLogger } from '../../infrastructure/logging/LlmContentLogger.js';
import { TurnService } from './TurnService.js';

/**
 * Monta o orquestrador do turno com 1 `LlmClient` compartilhado,
 * 1 `IStructuredResolver` (`PromptJsonResolver` default) e 1 agente por papel,
 * cada um com sua `temperature`. `ToolCallResolver` futuro = trocar 1 binding.
 */
export function buildTurnService(
  llmModel: BaseChatModel,
  WorldService: WorldService,
  CharacterService: CharacterService,
  llmService: LlmService,
  logger: ILogger,
  llmCallLogger?: LlmCallLogger,
  llmContentLogger?: LlmContentLogger,
): TurnService {
  const settings = { ...DEFAULT_SETTINGS };
  const client = new LlmClient(llmModel, llmCallLogger, logger, llmContentLogger);
  const resolver = new PromptJsonResolver(llmModel, llmCallLogger, logger, settings, llmContentLogger);
  const selfHealing = new SelfHealingService(llmModel, llmCallLogger, logger, settings);
  const arbiter = new ArbiterService(client, resolver, selfHealing);
  const gate = new GateService(client, resolver);
  const narrator = new NarratorService(
    client, selfHealing, settings, llmCallLogger, logger, llmContentLogger,
    llmService.summarizeMemory.bind(llmService),
  );
  const scene = {
    extractor: new SceneService(client, resolver),
    memory: new MemoryService(client, resolver, logger),
  };
  return new TurnService(
    arbiter,
    gate,
    narrator,
    new InventoryService(client, resolver),
    new MovementService(client, resolver),
    new ConditionsService(client, resolver),
    WorldService,
    CharacterService,
    settings,
    logger,
    scene,
  );
}
