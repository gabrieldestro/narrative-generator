import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { WorldTemplate } from '../models/world-template.model';
import type { CreateGamePayload, CreateGameResponse, PlayerActionPayload, TurnResponse, GameStateResponse } from '../models/api-payloads.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api';

  listWorlds(): Observable<WorldTemplate[]> {
    return this.http.get<WorldTemplate[]>(`${this.baseUrl}/worlds`);
  }

  createGame(payload: CreateGamePayload): Observable<CreateGameResponse> {
    return this.http.post<CreateGameResponse>(`${this.baseUrl}/games/new`, payload);
  }

  processTurn(sessionId: string, payload: PlayerActionPayload): Observable<TurnResponse> {
    return this.http.post<TurnResponse>(`${this.baseUrl}/games/${sessionId}/turn`, payload);
  }

  getGameState(sessionId: string): Observable<GameStateResponse> {
    return this.http.get<GameStateResponse>(`${this.baseUrl}/games/${sessionId}/state`);
  }
}
