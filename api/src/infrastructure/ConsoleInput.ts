import * as readline from "readline/promises";
import { stdin, stdout } from "process";
import type { IUserInput } from "../domain/ports.js";

export class ConsoleInput implements IUserInput {
  private rl = readline.createInterface({ input: stdin, output: stdout });

  async question(prompt: string): Promise<string> {
    return this.rl.question(prompt);
  }

  close(): void {
    this.rl.close();
  }
}
