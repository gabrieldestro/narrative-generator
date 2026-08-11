import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoggingService } from './logging.service';
import { SettingsService } from './settings.service';
import type { GameSettings } from '../models/game-settings.model';
import type { WorldTemplate } from '../models/world-template.model';
import type { CreateGamePayload, CreateGameResponse, PlayerActionPayload, TurnResponse, GameStateResponse, ObserveResponse } from '../models/api-payloads.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly log = inject(LoggingService);
  private readonly settingsService = inject(SettingsService);
  private readonly baseUrl = 'http://localhost:3000/api';

  private buildEngineSettings(): Partial<GameSettings> {
    const s = this.settingsService.settings();
    return {
      memoryWindowSize: s.memoryWindowSize,
      debug: s.debug,
      godMode: s.godMode,
      unexpectedEventChance: s.unexpectedEventChance,
      narrationSize: s.narrationSize,
    };
  }

  listWorlds(): Observable<WorldTemplate[]> {
    return this.http.get<WorldTemplate[]>(`${this.baseUrl}/worlds`).pipe(
      tap({
        next: (worlds) => this.log.info('ApiService.listWorlds', { count: worlds.length }),
        error: (err) => this.log.error('ApiService.listWorlds falhou', err),
      }),
    );
  }

  createGame(payload: CreateGamePayload): Observable<CreateGameResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<CreateGameResponse>(`${this.baseUrl}/games/new`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.createGame', { sessionId: res.sessionId, mode: payload.mode }),
        error: (err) => this.log.error('ApiService.createGame falhou', err, { mode: payload.mode }),
      }),
    );
  }

  processTurn(sessionId: string, payload: PlayerActionPayload): Observable<TurnResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<TurnResponse>(`${this.baseUrl}/games/${sessionId}/turn`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.processTurn', { sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.processTurn falhou', err, { sessionId }),
      }),
    );
  }

  observeTurn(sessionId: string, payload: PlayerActionPayload): Observable<ObserveResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<ObserveResponse>(`${this.baseUrl}/games/${sessionId}/observe`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.observeTurn', { sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.observeTurn falhou', err, { sessionId }),
      }),
    );
  }

  getGameState(sessionId: string): Observable<GameStateResponse> {
    return this.http.get<GameStateResponse>(`${this.baseUrl}/games/${sessionId}/state`).pipe(
      tap({
        next: (res) => this.log.info('ApiService.getGameState', { sessionId }),
        error: (err) => this.log.error('ApiService.getGameState falhou', err, { sessionId }),
      }),
    );
  }
}
