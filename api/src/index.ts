import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { JsonStateRepository } from "./infrastructure/persistence/JsonStateRepository.js";
import { WorldTemplateRepository } from "./infrastructure/persistence/WorldTemplateRepository.js";
import { ConsoleInput } from "./infrastructure/console/ConsoleInput.js";
import { ConsoleOutput } from "./infrastructure/console/ConsoleOutput.js";
import { LlmService } from "./application/shared/LlmService.js";
import { LlmCallLogger } from "./infrastructure/logging/LlmCallLogger.js";
import { SessionFactory } from "./application/session/SessionFactory.js";
import { GameService } from "./application/session/GameService.js";
import { CharacterService } from "./application/characters/CharacterService.js";
import { WorldService } from "./application/world/WorldService.js";
import { buildTurnService } from "./application/turn/buildTurnService.js";
import { PinoLogger } from "./infrastructure/logging/PinoLogger.js";
import { LlmContentLogger } from "./infrastructure/logging/LlmContentLogger.js";

dotenv.config();

const llm = new ChatOpenAI({
  temperature: 0.7,
  model: "gemma-4b",
  apiKey: process.env.OPENAI_API_KEY || "lm-studio",
  configuration: {
    baseURL: process.env.OPENAI_API_BASE || "http://localhost:1234/v1",
  },
});

const mainLogger = new PinoLogger();

async function main() {
  try {
    const input = new ConsoleInput();
    const output = new ConsoleOutput();
    const repository = new JsonStateRepository('savegame.json');
    const worldRepo = new WorldTemplateRepository();
    const llmCallLogger = new LlmCallLogger('logs/llm_calls.jsonl');
    const llmContentLogger = new LlmContentLogger('logs/llm_content.jsonl');
    const llmService = new LlmService(llm, {}, llmCallLogger, mainLogger, llmContentLogger);
    const worldService = new WorldService(llmService, mainLogger);
    const characterService = new CharacterService(llmService, {}, mainLogger);
    const sessionFactory = new SessionFactory(input, output, repository, llmService, worldRepo);
    const orchestrator = buildTurnService(llm, worldService, characterService, llmService, mainLogger, llmCallLogger, llmContentLogger);
    const engine = new GameService(
      input,
      output,
      repository,
      llmService,
      characterService,
      sessionFactory,
      { godMode: false },
      worldService,
      mainLogger,
      undefined,
      orchestrator
    );
    await engine.start();
  } catch (error) {
    mainLogger.error("Um erro grave ocorreu e interrompeu o motor", error instanceof Error ? error : new Error(String(error)));
  }
}

main().catch((err) => {
  mainLogger.error("Erro fatal no main", err instanceof Error ? err : new Error(String(err)));
});
