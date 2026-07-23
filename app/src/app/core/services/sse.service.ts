import { Injectable, inject } from '@angular/core';
import { GameStateService } from './game-state.service';
import type { PlayerActionPayload } from '../models/api-payloads.model';
import type { NpcDecision, DiceRoll } from '../models/turn-result.model';

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly gameState = inject(GameStateService);

  connectStream(sessionId: string, payload: PlayerActionPayload): void {
    this.gameState.isStreaming.set(true);
    this.gameState.clearNpcDecisions();

    const url = `http://localhost:3000/api/games/${sessionId}/turn/stream`;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(response => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processChunk = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            this.handleEvent(currentEvent, data);
          }
        }
      };

      const read = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          processChunk(decoder.decode(value, { stream: true }));
          read();
        });
      };
      read();
    });
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
        this.gameState.addNarrativeToken(data.token);
        break;
      case 'done':
        this.gameState.isStreaming.set(false);
        this.gameState.gameState.set(data.updatedState);
        break;
    }
  }
}
