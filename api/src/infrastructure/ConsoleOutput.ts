import type { IOutputWriter } from "../domain/ports.js";

export class ConsoleOutput implements IOutputWriter {
  write(text: string): void {
    process.stdout.write(text);
  }

  writeLine(text: string = ""): void {
    console.log(text);
  }

  clear(): void {
    console.clear();
  }
}
