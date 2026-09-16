import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILogger } from '../domain/ports.js';
import { DEFAULT_SETTINGS } from '../domain/types.js';
import { LlmClient } from './llm/LlmClient.js';
import { PromptJsonResolver } from './llm/StructuredResolver.js';
import { SelfHealingService } from './selfHealing/SelfHealingService.js';
import { ArbiterAgent } from './llm/arbiter/ArbiterAgent.js';
import { ReactionGateAgent } from './llm/gate/ReactionGateAgent.js';
import { NarratorAgent } from './llm/narrator/NarratorAgent.js';
import { InventoryExtractorAgent } from './llm/extractors/inventory/InventoryExtractorAgent.js';
import { MovementExtractorAgent } from './llm/extractors/movement/MovementExtractorAgent.js';
import { ConditionsExtractorAgent } from './llm/extractors/conditions/ConditionsExtractorAgent.js';
import { SceneExtractorAgent } from './llm/extractors/scene/SceneExtractorAgent.js';
import { MemoryAgent } from './llm/memory/MemoryAgent.js';
import type { LlmService } from './LlmService.js';
import type { CpuReflectionService } from './npcAgent/CpuReflectionService.js';
import type { GameManagementService } from './GameManagementService.js';
import { LlmCallLogger } from '../infrastructure/LlmCallLogger.js';
import { LlmContentLogger } from '../infrastructure/LlmContentLogger.js';
import { TurnOrchestrator } from './TurnOrchestrator.js';

/**
 * Monta o orquestrador do turno com 1 `LlmClient` compartilhado,
 * 1 `IStructuredResolver` (`PromptJsonResolver` default) e 1 agente por papel,
 * cada um com sua `temperature`. `ToolCallResolver` futuro = trocar 1 binding.
 */
export function buildTurnOrchestrator(
  llmModel: BaseChatModel,
  gameManagementService: GameManagementService,
  cpuReflectionService: CpuReflectionService,
  llmService: LlmService,
  logger: ILogger,
  llmCallLogger?: LlmCallLogger,
  llmContentLogger?: LlmContentLogger,
): TurnOrchestrator {
  const settings = { ...DEFAULT_SETTINGS };
  const client = new LlmClient(llmModel, llmCallLogger, logger, llmContentLogger);
  const resolver = new PromptJsonResolver(llmModel, llmCallLogger, logger, settings, llmContentLogger);
  const selfHealing = new SelfHealingService(llmModel, llmCallLogger, logger, settings);
  const arbiter = new ArbiterAgent(client, resolver, selfHealing);
  const gate = new ReactionGateAgent(client, resolver);
  const narrator = new NarratorAgent(
    client, selfHealing, settings, llmCallLogger, logger, llmContentLogger,
    llmService.summarizeMemory.bind(llmService),
  );
  const scene = {
    extractor: new SceneExtractorAgent(client, resolver),
    memory: new MemoryAgent(client, resolver, logger),
  };
  return new TurnOrchestrator(
    arbiter,
    gate,
    narrator,
    new InventoryExtractorAgent(client, resolver),
    new MovementExtractorAgent(client, resolver),
    new ConditionsExtractorAgent(client, resolver),
    gameManagementService,
    cpuReflectionService,
    settings,
    logger,
    scene,
  );
}
