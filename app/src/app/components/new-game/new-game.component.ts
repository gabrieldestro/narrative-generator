import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { GameStateService } from '../../core/services/game-state.service';
import { LoggingService } from '../../core/services/logging.service';
import { WorldListComponent } from './world-list/world-list.component';
import { LoadingOverlayComponent } from '../../shared/components/loading-overlay/loading-overlay.component';
import type { WorldTemplate } from '../../core/models/world-template.model';
import type { SavedGameSummary } from '../../core/models/session-save.model';

@Component({
  selector: 'ng-new-game',
  standalone: true,
  imports: [
    RouterLink,
    MatToolbarModule, MatButtonModule, MatIconModule, MatCardModule, MatTooltipModule,
    WorldListComponent, LoadingOverlayComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-game.component.html',
  styleUrl: './new-game.component.scss',
})

export class NewGameComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);
  private readonly gameState = inject(GameStateService);

  readonly isCreating = signal(false);
  readonly saves = signal<SavedGameSummary[]>([]);
  readonly loadingSaves = signal(true);
  readonly operatingId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadSaves();
  }

  loadSaves(): void {
    this.loadingSaves.set(true);
    this.api.listSaves().subscribe({
      next: (saves) => {
        this.log.info('Partidas salvas carregadas', { count: saves.length });
        this.saves.set(saves);
        this.loadingSaves.set(false);
      },
      error: (err) => {
        this.loadingSaves.set(false);
        this.log.error('Falha ao carregar partidas salvas', err);
        this.snackBar.open('Não foi possível carregar suas partidas salvas.', 'Fechar', { duration: 4000 });
      },
    });
  }

  onContinueSave(save: SavedGameSummary): void {
    if (this.operatingId()) return;
    this.operatingId.set(save.id);
    this.api.loadSave(save.id).subscribe({
      next: (bundle) => {
        this.log.info('Partida restaurada', { sessionId: save.id, turnNumber: bundle.state.turnNumber });
        this.gameState.restore(save.id, bundle.state);
        this.operatingId.set(null);
        this.router.navigate(['/game', save.id]);
      },
      error: (err) => {
        this.operatingId.set(null);
        this.log.error('Falha ao restaurar partida', err, { sessionId: save.id });
        this.snackBar.open('Falha ao restaurar a partida.', 'Fechar', { duration: 5000 });
      },
    });
  }

  requestDeleteSave(save: SavedGameSummary): void {
    if (this.operatingId()) return;
    const snack = this.snackBar.open(`Excluir a partida "${save.title}"?`, 'Excluir', { duration: 5000 });
    snack.onAction().subscribe(() => this.confirmDeleteSave(save));
  }

  private confirmDeleteSave(save: SavedGameSummary): void {
    this.operatingId.set(save.id);
    this.api.deleteSave(save.id).subscribe({
      next: () => {
        this.log.info('Partida excluída', { sessionId: save.id });
        this.saves.update(list => list.filter(s => s.id !== save.id));
        this.operatingId.set(null);
        this.snackBar.open('Partida excluída.', 'Fechar', { duration: 3000 });
      },
      error: (err) => {
        this.operatingId.set(null);
        this.log.error('Falha ao excluir partida', err, { sessionId: save.id });
        this.snackBar.open('Falha ao excluir a partida.', 'Fechar', { duration: 5000 });
      },
    });
  }

  formatDate(iso: string): string {
    const date = new Date(iso);
    return isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR');
  }

  goToCustomScenario(): void {
    if (this.isCreating()) return;
    this.router.navigate(['/new-game/custom']);
  }

  onUseAsBase(world: WorldTemplate): void {
    this.log.info('Template usado como base', { worldName: world.name });
    this.router.navigate(['/new-game/custom'], { state: { baseTemplate: world } });
  }

  onSelectWorld(templateName: string): void {
    this.log.info('Criando jogo a partir de template', { templateName });
    this.isCreating.set(true);
    this.api.createGame({ mode: 'template', templateName }).subscribe({
      next: (res) => {
        this.log.info('Jogo criado com sucesso', { sessionId: res.sessionId });
        this.router.navigate(['/game', res.sessionId]);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.log.error('Erro ao criar jogo (template)', err, { templateName });
        this.snackBar.open('Erro ao criar jogo: ' + (err.message ?? 'Erro desconhecido'), 'Fechar', { duration: 5000 });
      },
    });
  }
}