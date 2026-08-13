import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { LoggingService } from './logging.service';
import { SettingsService } from './settings.service';
import type { GameSettings } from '../models/game-settings.model';
import type { WorldTemplate } from '../models/world-template.model';
import type { CreateGamePayload, CreateGameResponse, PlayerActionPayload, TurnResponse, GameStateResponse, ObserveResponse, NarrateResponse } from '../models/api-payloads.model';
import type { SavedGameSummary, SessionBundle } from '../models/session-save.model';

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

  narrateTurn(sessionId: string, payload: PlayerActionPayload): Observable<NarrateResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<NarrateResponse>(`${this.baseUrl}/games/${sessionId}/narrate`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.narrateTurn', { sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.narrateTurn falhou', err, { sessionId }),
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

  listSaves(): Observable<SavedGameSummary[]> {
    return this.http.get<SessionBundle[]>(`${this.baseUrl}/saves`).pipe(
      map(bundles => bundles.map(({ state: _state, schemaVersion: _v, ...meta }) => meta)),
      tap({
        next: (saves) => this.log.info('ApiService.listSaves', { count: saves.length }),
        error: (err) => this.log.error('ApiService.listSaves falhou', err),
      }),
    );
  }

  loadSave(sessionId: string): Observable<SessionBundle> {
    return this.http.get<SessionBundle>(`${this.baseUrl}/saves/${sessionId}`).pipe(
      tap({
        next: (bundle) => this.log.info('ApiService.loadSave', { sessionId, turnNumber: bundle.state.turnNumber }),
        error: (err) => this.log.error('ApiService.loadSave falhou', err, { sessionId }),
      }),
    );
  }

  deleteSave(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/saves/${sessionId}`).pipe(
      tap({
        next: () => this.log.info('ApiService.deleteSave', { sessionId }),
        error: (err) => this.log.error('ApiService.deleteSave falhou', err, { sessionId }),
      }),
    );
  }
}
