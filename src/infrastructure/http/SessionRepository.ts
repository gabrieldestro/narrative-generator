import type { GameState } from "../../domain/types.js";

export class SessionRepository {
  private readonly sessions = new Map<string, GameState>();

  public saveSession(sessionId: string, state: GameState): void {
    this.sessions.set(sessionId, state);
  }

  public getSession(sessionId: string): GameState | undefined {
    return this.sessions.get(sessionId);
  }

  public hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  public deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
