import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { GameStateService } from '../../../core/services/game-state.service';
import { ApiService } from '../../../core/services/api.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ActionTypeSelectorComponent } from './action-type-selector/action-type-selector.component';
import { ActionIntentSelectorComponent } from './action-intent-selector/action-intent-selector.component';
import { ActionTextInputComponent } from './action-text-input/action-text-input.component';
import type { ActionType, ActionIntent, PlayerActionPayload } from '../../../core/models/api-payloads.model';

@Component({
  selector: 'ng-action-input',
  standalone: true,
  imports: [
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatProgressBarModule,
    ActionTypeSelectorComponent, ActionIntentSelectorComponent, ActionTextInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-input.component.html',
  styleUrl: './action-input.component.scss',
})
export class ActionInputComponent {
  readonly gameState = inject(GameStateService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);

  readonly actionType = signal<ActionType>('free');
  readonly actionIntent = signal<ActionIntent>('neutral');
  readonly playerText = signal('');

  /** "Elara reagiu (2/5)" durante o turno; null fora dele. */
  readonly progressLabel = computed(() => {
    const progress = this.gameState.turnProgress();
    if (!progress) return null;
    return `${progress.label} (${progress.done}/${progress.total})`;
  });

  readonly progressValue = computed(() => {
    const progress = this.gameState.turnProgress();
    if (!progress || progress.total === 0) return 0;
    return (progress.done / progress.total) * 100;
  });

  private cancelRequested = false;

  /**
   * Turno do jogador por fases + auto-avanço dos NPCs pela rotação:
   * cada fase já rende visual (ação → reações → árbitro → narração).
   */
  async submit(): Promise<void> {
    const text = this.playerText().trim();
    if (!text) return;

    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    const payload: PlayerActionPayload = {
      actionType: this.actionType(),
      actionIntent: this.actionIntent(),
      playerText: text,
      characterName: this.gameState.playerCharacter()?.name,
    };

    this.log.info('Turno submetido', { actionType: payload.actionType, intent: payload.actionIntent, playerText: text, charName: payload.characterName });

    this.gameState.clearNpcDecisions();
    this.gameState.isLoading.set(true);
    this.cancelRequested = false;

    try {
      let sid = sessionId;
      let awaitingPlayer = false;

      // Turno do jogador.
      const first = await this.runPhasedTurn(sid, payload);
      sid = first.sessionId;
      awaitingPlayer = first.awaitingPlayer;
      this.playerText.set('');

      // Auto-avanço: turnos de NPC até a vez voltar ao jogador.
      let guard = 0;
      while (!awaitingPlayer && !this.cancelRequested && guard++ < 12) {
        const next = await this.runPhasedTurn(sid, null);
        sid = next.sessionId;
        awaitingPlayer = next.awaitingPlayer;
      }
      if (guard >= 12) {
        this.log.error('Auto-avanço de NPCs excedeu o limite de segurança', new Error('NPC_ADVANCE_GUARD'));
      }
    } catch (err) {
      this.gameState.isLoading.set(false);
      if (err instanceof Error && err.message === 'Turno cancelado pelo jogador.') {
        this.gameState.clearPhasedTurn();
        return;
      }
      this.gameState.error.set({ message: err instanceof Error ? err.message : 'Erro ao processar turno', code: 'TURN_ERROR', timestamp: new Date() });
      this.log.error('Erro ao processar turno', err instanceof Error ? err : new Error(String(err)));
      this.snackBar.open('Erro ao processar turno. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
    }
  }

  /**
   * Roda 1 turno (1 ação + reações) fase a fase, aplicando cada visual.
   * `payload` nulo ⇒ turno de NPC pela rotação.
   */
  private async runPhasedTurn(
    sessionId: string,
    payload: PlayerActionPayload | null,
  ): Promise<{ sessionId: string; awaitingPlayer: boolean }> {
    const started = await firstValueFrom(
      this.api.startTurn(sessionId, payload ?? { characterName: this.gameState.playerCharacter()?.name }),
    );
    const turnId = started.turnId;
    const total = started.reactionsPending + 3; // reações + árbitro + narração + commit
    this.gameState.beginPhasedTurn(started);

    let done = 1;
    while (done - 1 < started.reactionsPending && !this.cancelRequested) {
      const reaction = await firstValueFrom(this.api.reactTurn(sessionId, turnId));
      done++;
      this.gameState.applyReaction(reaction, done, total);
    }
    if (this.cancelRequested) {
      await firstValueFrom(this.api.cancelTurn(sessionId, turnId));
      throw new Error('Turno cancelado pelo jogador.');
    }

    done++;
    const judged = await firstValueFrom(this.api.arbiterTurn(sessionId, turnId));
    this.gameState.applyArbiter(judged, done, total);

    done++;
    const told = await firstValueFrom(this.api.narrateTurnPhase(sessionId, turnId));
    this.gameState.applyNarration(told.narration, done, total);

    const res = await firstValueFrom(this.api.finishTurn(sessionId, turnId));
    this.gameState.setTurnResult(res);
    if (res.sessionId && res.sessionId !== sessionId) {
      this.router.navigate(['/game', res.sessionId], { replaceUrl: true });
    }
    return { sessionId: res.sessionId, awaitingPlayer: res.awaitingPlayer };
  }

  async cancel(): Promise<void> {
    const sessionId = this.gameState.sessionId();
    const turnId = this.gameState.activeTurnId();
    this.cancelRequested = true;
    if (!sessionId || !turnId) return;
    try {
      await firstValueFrom(this.api.cancelTurn(sessionId, turnId));
    } catch (err) {
      this.log.error('Erro ao cancelar turno', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.gameState.clearPhasedTurn();
      this.gameState.isLoading.set(false);
    }
  }

  observe(): void {
    const text = this.playerText().trim();
    if (!text) return;

    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    const payload: PlayerActionPayload = {
      playerText: text,
      characterName: this.gameState.playerCharacter()?.name,
    };

    this.log.info('Observação submetida', { playerText: text, charName: payload.characterName });

    this.gameState.isLoading.set(true);

    this.api.observeTurn(sessionId, payload).subscribe({
      next: (res) => {
        this.gameState.setObservation(res);
        this.playerText.set('');
        if (res.sessionId && res.sessionId !== sessionId) {
          this.router.navigate(['/game', res.sessionId], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.gameState.isLoading.set(false);
        this.gameState.error.set({ message: err.message ?? 'Erro ao observar a cena', code: 'OBSERVE_ERROR', timestamp: new Date() });
        this.log.error('Erro ao observar a cena', err instanceof Error ? err : new Error(String(err)));
        this.snackBar.open('Erro ao observar a cena. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
      },
    });
  }

  narrate(): void {
    const text = this.playerText().trim();
    if (!text) return;

    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    const payload: PlayerActionPayload = {
      playerText: text,
      characterName: this.gameState.playerCharacter()?.name,
    };

    this.log.info('Narração submetida', { playerText: text, charName: payload.characterName });

    this.gameState.isLoading.set(true);

    this.api.narrateTurn(sessionId, payload).subscribe({
      next: (res) => {
        this.gameState.setNarration(res);
        this.playerText.set('');
        if (res.sessionId && res.sessionId !== sessionId) {
          this.router.navigate(['/game', res.sessionId], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.gameState.isLoading.set(false);
        this.gameState.error.set({ message: err.message ?? 'Erro ao narrar a cena', code: 'NARRATE_ERROR', timestamp: new Date() });
        this.log.error('Erro ao narrar a cena', err instanceof Error ? err : new Error(String(err)));
        this.snackBar.open('Erro ao narrar a cena. Verifique a conexão com o servidor.', 'Fechar', { duration: 5000 });
      },
    });
  }
}
