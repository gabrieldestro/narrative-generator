import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { LoggingService } from './logging.service';
import { SettingsService } from './settings.service';
import type { GameSettings } from '../models/game-settings.model';
import type { WorldTemplate } from '../models/world-template.model';
import type { CreateGamePayload, CreateGameResponse, PlayerActionPayload, TurnResponse, StartTurnResponse, ReactTurnResponse, ArbiterTurnResponse, TurnNarrateResponse, TurnStatusResponse, GameStateResponse, ObserveResponse, NarrateResponse, EnrichPayload, EnrichResponse, SaveWorldResponse, AdminCommandPayload, AdminCommandResponse } from '../models/api-payloads.model';
import type { SavedGameSummary, SessionBundle, PruneResponse } from '../models/session-save.model';

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
      apiUrl: s.apiUrl,
      model: s.model,
      apiToken: s.apiToken,
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

  /** Fase `start`: ação+dado+gate. Sem `playerText`, avança NPC pela rotação. */
  startTurn(sessionId: string, payload: PlayerActionPayload): Observable<StartTurnResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<StartTurnResponse>(`${this.baseUrl}/games/${sessionId}/turn/start`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.startTurn', { sessionId, turnId: res.turnId, actor: res.actor }),
        error: (err) => this.log.error('ApiService.startTurn falhou', err, { sessionId }),
      }),
    );
  }

  /** Fase `react`: resolve o próximo reator (1 LLM por chamada). */
  reactTurn(sessionId: string, turnId: string): Observable<ReactTurnResponse> {
    return this.http.post<ReactTurnResponse>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/react`, { settings: this.buildEngineSettings() }).pipe(
      tap({
        next: (res) => this.log.info('ApiService.reactTurn', { sessionId, turnId, who: res.who, ignored: res.ignored }),
        error: (err) => this.log.error('ApiService.reactTurn falhou', err, { sessionId, turnId }),
      }),
    );
  }

  /** Fase `arbiter`: julga ação + reações. */
  arbiterTurn(sessionId: string, turnId: string): Observable<ArbiterTurnResponse> {
    return this.http.post<ArbiterTurnResponse>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/arbiter`, { settings: this.buildEngineSettings() }).pipe(
      tap({
        next: (res) => this.log.info('ApiService.arbiterTurn', { sessionId, turnId, outcome: res.outcome }),
        error: (err) => this.log.error('ApiService.arbiterTurn falhou', err, { sessionId, turnId }),
      }),
    );
  }

  /** Fase `narrate`: prosa do fato julgado. */
  narrateTurnPhase(sessionId: string, turnId: string): Observable<TurnNarrateResponse> {
    return this.http.post<TurnNarrateResponse>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/narrate`, { settings: this.buildEngineSettings() }).pipe(
      tap({
        next: (res) => this.log.info('ApiService.narrateTurnPhase', { sessionId, turnId }),
        error: (err) => this.log.error('ApiService.narrateTurnPhase falhou', err, { sessionId, turnId }),
      }),
    );
  }

  /** Fase `finish`: commit + checkpoint novo + próximo ator da rotação. */
  finishTurn(sessionId: string, turnId: string): Observable<TurnResponse> {
    return this.http.post<TurnResponse>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/finish`, { settings: this.buildEngineSettings() }).pipe(
      tap({
        next: (res) => this.log.info('ApiService.finishTurn', { sessionId, turnId, newSessionId: res.sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.finishTurn falhou', err, { sessionId, turnId }),
      }),
    );
  }

  turnStatus(sessionId: string, turnId: string): Observable<TurnStatusResponse> {
    return this.http.get<TurnStatusResponse>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/status`).pipe(
      tap({
        next: (res) => this.log.info('ApiService.turnStatus', { sessionId, turnId, phase: res.phase }),
        error: (err) => this.log.error('ApiService.turnStatus falhou', err, { sessionId, turnId }),
      }),
    );
  }

  cancelTurn(sessionId: string, turnId: string): Observable<{ cancelled: boolean }> {
    return this.http.post<{ cancelled: boolean }>(`${this.baseUrl}/games/${sessionId}/turn/${turnId}/cancel`, {}).pipe(
      tap({
        next: () => this.log.info('ApiService.cancelTurn', { sessionId, turnId }),
        error: (err) => this.log.error('ApiService.cancelTurn falhou', err, { sessionId, turnId }),
      }),
    );
  }

  observeTurn(sessionId: string, payload: PlayerActionPayload): Observable<ObserveResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<ObserveResponse>(`${this.baseUrl}/games/${sessionId}/observe`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.observeTurn', { sessionId, newSessionId: res.sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.observeTurn falhou', err, { sessionId }),
      }),
    );
  }

  narrateTurn(sessionId: string, payload: PlayerActionPayload): Observable<NarrateResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<NarrateResponse>(`${this.baseUrl}/games/${sessionId}/narrate`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.narrateTurn', { sessionId, newSessionId: res.sessionId, turnNumber: res.updatedState?.turnNumber }),
        error: (err) => this.log.error('ApiService.narrateTurn falhou', err, { sessionId }),
      }),
    );
  }

  executeCommand(sessionId: string, payload: AdminCommandPayload): Observable<AdminCommandResponse> {
    const body = { ...payload, settings: this.buildEngineSettings() };
    return this.http.post<AdminCommandResponse>(`${this.baseUrl}/games/${sessionId}/command`, body).pipe(
      tap({
        next: (res) => this.log.info('ApiService.executeCommand', { sessionId, newSessionId: res.sessionId, command: payload.command }),
        error: (err) => this.log.error('ApiService.executeCommand falhou', err, { sessionId, command: payload.command }),
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
    return this.http.get<SavedGameSummary[]>(`${this.baseUrl}/saves`).pipe(
      map(saves => [...saves].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      tap({
        next: (saves) => this.log.info('ApiService.listSaves', { count: saves.length }),
        error: (err) => this.log.error('ApiService.listSaves falhou', err),
      }),
    );
  }

  listHistory(rootId: string): Observable<SavedGameSummary[]> {
    return this.http.get<SavedGameSummary[]>(`${this.baseUrl}/saves/${rootId}/history`).pipe(
      map(history => [...history].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())),
      tap({
        next: (history) => this.log.info('ApiService.listHistory', { rootId, count: history.length }),
        error: (err) => this.log.error('ApiService.listHistory falhou', err, { rootId }),
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

  /** Apaga a campanha inteira (todos os checkpoints do rootId). */
  deleteCampaign(rootId: string): Observable<{ deleted: number; ids: string[] }> {
    return this.http.delete<{ deleted: number; ids: string[] }>(`${this.baseUrl}/saves/campaign/${rootId}`).pipe(
      tap({
        next: (res) => this.log.info('ApiService.deleteCampaign', { rootId, deleted: res.deleted }),
        error: (err) => this.log.error('ApiService.deleteCampaign falhou', err, { rootId }),
      }),
    );
  }

  pruneSaves(options?: { keepLatest?: boolean; rootId?: string }): Observable<PruneResponse> {
    return this.http.post<PruneResponse>(`${this.baseUrl}/saves/prune`, options ?? {}).pipe(
      tap({
        next: (res) => this.log.info('ApiService.pruneSaves', { deleted: res.deleted, kept: res.kept }),
        error: (err) => this.log.error('ApiService.pruneSaves falhou', err, options),
      }),
    );
  }

  enrichField(payload: EnrichPayload): Observable<EnrichResponse> {
    return this.http.post<EnrichResponse>(`${this.baseUrl}/games/enrich`, payload).pipe(
      tap({
        next: (res) => this.log.info('ApiService.enrichField', { field: payload.field, length: res.enriched?.length }),
        error: (err) => this.log.error('ApiService.enrichField falhou', err, { field: payload.field }),
      }),
    );
  }

  /** Salva o cenário customizado como template reutilizável (não cria jogo). */
  saveWorld(world: WorldTemplate): Observable<SaveWorldResponse> {
    return this.http.post<SaveWorldResponse>(`${this.baseUrl}/worlds`, world).pipe(
      tap({
        next: (res) => this.log.info('ApiService.saveWorld', { id: res.id }),
        error: (err) => this.log.error('ApiService.saveWorld falhou', err),
      }),
    );
  }
}
