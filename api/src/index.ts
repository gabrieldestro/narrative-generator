import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { JsonStateRepository } from "./infrastructure/JsonStateRepository.js";
import { WorldTemplateRepository } from "./infrastructure/WorldTemplateRepository.js";
import { ConsoleInput } from "./infrastructure/ConsoleInput.js";
import { ConsoleOutput } from "./infrastructure/ConsoleOutput.js";
import { LlmService } from "./application/LlmService.js";
import { LlmCallLogger } from "./infrastructure/LlmCallLogger.js";
import { SessionFactory } from "./application/SessionFactory.js";
import { GameEngine } from "./application/GameEngine.js";
import { CpuReflectionService } from "./application/npcAgent/CpuReflectionService.js";
import { GameManagementService } from "./application/GameManagementService.js";
import { PinoLogger } from "./infrastructure/PinoLogger.js";
import { LlmContentLogger } from "./infrastructure/LlmContentLogger.js";

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
    const llmService = new LlmService(llm, {}, new LlmCallLogger('logs/llm_calls.jsonl'), mainLogger, new LlmContentLogger('logs/llm_content.jsonl'));
    const gameManagementService = new GameManagementService(llmService, mainLogger);
    const cpuReflectionService = new CpuReflectionService(llmService, {}, mainLogger);
    const sessionFactory = new SessionFactory(input, output, repository, llmService, worldRepo);
    const engine = new GameEngine(
      input,
      output,
      repository,
      llmService,
      cpuReflectionService,
      sessionFactory,
      { godMode: false },
      gameManagementService,
      mainLogger
    );
    await engine.start();
  } catch (error) {
    mainLogger.error("Um erro grave ocorreu e interrompeu o motor", error instanceof Error ? error : new Error(String(error)));
  }
}

main().catch((err) => {
  mainLogger.error("Erro fatal no main", err instanceof Error ? err : new Error(String(err)));
});
