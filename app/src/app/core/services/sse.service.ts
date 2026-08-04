import { Injectable, inject, NgZone } from '@angular/core';
import { GameStateService } from './game-state.service';
import { LoggingService } from './logging.service';
import type { PlayerActionPayload } from '../models/api-payloads.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly gameState = inject(GameStateService);
  private readonly log = inject(LoggingService);
  private readonly ngZone = inject(NgZone);
  private abortController: AbortController | null = null;

  connectStream(sessionId: string, payload: PlayerActionPayload, timeoutMs = 60000): void {
    this.gameState.isLoading.set(true);
    this.gameState.clearNpcDecisions();
    this.gameState.error.set(null);

    const url = `http://localhost:3000/api/games/${sessionId}/turn/stream`;
    this.log.info('SSE conectando', { url, payloadSize: JSON.stringify(payload).length });

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.log.warn('SSE timeout atingido', { durationMs: timeoutMs });
      this.abortController?.abort();
      this.ngZone.run(() => this.handleError(new Error('Timeout na conexão SSE')));
    }, timeoutMs);

    this.ngZone.runOutsideAngular(() => {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController!.signal,
      })
        .then(response => {
          clearTimeout(timeoutId);
          if (!response.body) {
            throw new Error('Response body é nulo');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentEvent = '';

          const processChunk = (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  this.log.debug('SSE evento processado', { event: currentEvent, dataPreview: JSON.stringify(data).slice(0, 100) });
                  this.ngZone.run(() => this.handleEvent(currentEvent, data));
                } catch (parseErr) {
                  this.log.error('SSE JSON.parse falhou', parseErr instanceof Error ? parseErr : new Error(String(parseErr)), { rawLine: line.slice(0, 200) });
                }
              } else if (line.trim() === '') {
                currentEvent = '';
              }
            }
          };

          const read = () => {
            reader.read()
              .then(({ done, value }) => {
                if (done) {
                  this.log.info('SSE stream encerrada', { reason: 'stream completa' });
                  this.ngZone.run(() => {
                    this.gameState.isLoading.set(false);
                  });
                  return;
                }
                const chunk = decoder.decode(value, { stream: true });
                this.log.debug('SSE chunk recebido', { size: chunk.length, rawChunk: chunk.slice(0, 100) });
                processChunk(chunk);
                read();
              })
              .catch((err: unknown) => {
                const error = err instanceof Error ? err : new Error(String(err));
                this.log.error('SSE reader.read() erro', error);
                this.ngZone.run(() => this.handleError(error));
              });
          };
          read();
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          const error = err instanceof Error ? err : new Error(String(err));
          if (error.name === 'AbortError') {
            this.log.warn('SSE fetch abortado', { reason: error.message });
          } else {
            this.log.error('SSE fetch erro', error);
          }
          this.ngZone.run(() => this.handleError(error));
        });
    });
  }

  disconnect(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.gameState.isLoading.set(false);
    this.log.info('SSE desconectado manualmente');
  }

  private handleError(error: Error): void {
    this.gameState.isLoading.set(false);
    this.gameState.error.set({ message: error.message, code: 'SSE_ERROR', timestamp: new Date() });
  }

  private handleEvent(event: string, data: any): void {
    switch (event) {
      case 'start':
        this.gameState.clearNpcDecisions();
        break;
      case 'npc_decisions':
        (data as NpcDecision[]).forEach(d => this.gameState.addNpcDecision(d));
        break;
      case 'dice_rolls':
        (data as DiceRoll[]).forEach(r => this.gameState.addDiceRoll(r));
        break;
      case 'arbiter':
        this.gameState.arbiterResolution.set(data.resolution);
        break;
      case 'token':
        break;
      case 'done': {
        const turnBeforeUpdate = this.gameState.gameState()?.turnNumber ?? 1;
        this.gameState.isLoading.set(false);
        this.gameState.gameState.set(data.updatedState);
        this.gameState.saveCurrentTurnToHistory(turnBeforeUpdate);
        break;
      }

    }
  }
}
