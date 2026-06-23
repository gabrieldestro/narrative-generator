import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import { JsonStateRepository } from "./infrastructure/JsonStateRepository.js";
import { WorldTemplateRepository } from "./infrastructure/WorldTemplateRepository.js";
import { ConsoleInput } from "./infrastructure/ConsoleInput.js";
import { ConsoleOutput } from "./infrastructure/ConsoleOutput.js";
import { GameEngine } from "./application/GameEngine.js";

dotenv.config();

const llm = new ChatOpenAI({
  temperature: 0.7,
  model: "gemma-4b",
  apiKey: process.env.OPENAI_API_KEY || "lm-studio",
  configuration: {
    baseURL: process.env.OPENAI_API_BASE || "http://localhost:1234/v1",
  },
});

async function main() {
  try {
    const input = new ConsoleInput();
    const output = new ConsoleOutput();
    const repository = new JsonStateRepository('savegame.json');
    const worldRepo = new WorldTemplateRepository();
    const engine = new GameEngine(input, output, repository, llm, worldRepo);
    await engine.start();
  } catch (error) {
    console.error("Um erro grave ocorreu e interrompeu o motor:", error);
  }
}

main().catch(console.error);
