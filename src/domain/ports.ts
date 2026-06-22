export interface IUserInput {
  question(prompt: string): Promise<string>;
  close(): void;
}

export interface IOutputWriter {
  write(text: string): void;
  writeLine(text?: string): void;
  clear(): void;
}
