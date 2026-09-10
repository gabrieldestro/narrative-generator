import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { LoggingService } from '../../../core/services/logging.service';
import type { SavedGameSummary } from '../../../core/models/session-save.model';

export interface CheckpointDialogData {
  rootId: string;
  title: string;
}

export interface CheckpointDialogResult {
  action?: 'continued' | 'pruned' | 'deleted';
  checkpointId?: string;
}

@Component({
  selector: 'ng-checkpoint-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkpoint-history-dialog.component.html',
  styleUrl: './checkpoint-history-dialog.component.scss',
})
export class CheckpointHistoryDialogComponent implements OnInit {
  readonly data = inject<CheckpointDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CheckpointHistoryDialogComponent, CheckpointDialogResult>);
  private readonly api = inject(ApiService);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);

  readonly checkpoints = signal<SavedGameSummary[]>([]);
  readonly loading = signal(true);
  readonly operatingId = signal<string | null>(null);
  readonly isPruning = signal(false);

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.loading.set(true);
    this.api.listHistory(this.data.rootId).subscribe({
      next: (list) => {
        this.log.info('Histórico de checkpoints carregado', { rootId: this.data.rootId, count: list.length });
        this.checkpoints.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.log.error('Falha ao carregar histórico de checkpoints', err, { rootId: this.data.rootId });
        this.snackBar.open('Não foi possível carregar o histórico de checkpoints.', 'Fechar', { duration: 4000 });
      },
    });
  }

  getBranchBadgeStyle(branchId: number): { [key: string]: string } {
    const hues = [220, 160, 280, 35, 340, 190, 80];
    const hue = hues[branchId % hues.length];
    return {
      '--branch-color': `hsl(${hue}, 80%, 65%)`,
      '--branch-bg': `hsla(${hue}, 80%, 50%, 0.15)`,
      '--branch-border': `hsla(${hue}, 80%, 65%, 0.35)`,
    };
  }

  formatDate(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  onContinue(checkpoint: SavedGameSummary): void {
    if (this.operatingId() || this.isPruning()) return;
    this.operatingId.set(checkpoint.id);

    this.api.loadSave(checkpoint.id).subscribe({
      next: (bundle) => {
        this.log.info('Checkpoint restaurado a partir do histórico', { checkpointId: checkpoint.id, turnNumber: bundle.state.turnNumber });
        this.gameState.restore(checkpoint.id, bundle.state);
        this.operatingId.set(null);
        this.dialogRef.close({ action: 'continued', checkpointId: checkpoint.id });
        this.router.navigate(['/game', checkpoint.id]);
      },
      error: (err) => {
        this.operatingId.set(null);
        this.log.error('Falha ao restaurar checkpoint', err, { checkpointId: checkpoint.id });
        this.snackBar.open('Falha ao carregar este checkpoint.', 'Fechar', { duration: 4000 });
      },
    });
  }

  requestDelete(checkpoint: SavedGameSummary): void {
    if (this.operatingId() || this.isPruning()) return;
    const snack = this.snackBar.open(`Excluir o checkpoint do Turno ${checkpoint.turnNumber}?`, 'Excluir', { duration: 5000 });
    snack.onAction().subscribe(() => this.confirmDelete(checkpoint));
  }

  private confirmDelete(checkpoint: SavedGameSummary): void {
    this.operatingId.set(checkpoint.id);
    this.api.deleteSave(checkpoint.id).subscribe({
      next: () => {
        this.log.info('Checkpoint excluído', { checkpointId: checkpoint.id });
        this.checkpoints.update(list => list.filter(c => c.id !== checkpoint.id));
        this.operatingId.set(null);
        this.snackBar.open('Checkpoint excluído com sucesso.', 'Fechar', { duration: 3000 });
        if (this.checkpoints().length === 0) {
          this.dialogRef.close({ action: 'deleted' });
        }
      },
      error: (err) => {
        this.operatingId.set(null);
        this.log.error('Falha ao excluir checkpoint', err, { checkpointId: checkpoint.id });
        this.snackBar.open('Não foi possível excluir o checkpoint.', 'Fechar', { duration: 4000 });
      },
    });
  }

  requestPrune(): void {
    if (this.operatingId() || this.isPruning()) return;
    const snack = this.snackBar.open('Limpar histórico e manter apenas o checkpoint mais recente?', 'Limpar', { duration: 5000 });
    snack.onAction().subscribe(() => this.confirmPrune());
  }

  private confirmPrune(): void {
    this.isPruning.set(true);
    this.api.pruneSaves({ rootId: this.data.rootId }).subscribe({
      next: (res) => {
        this.isPruning.set(false);
        this.log.info('Histórico da campanha limpo', { rootId: this.data.rootId, deleted: res.deleted, kept: res.kept });
        this.snackBar.open(`Histórico limpo! ${res.deleted} checkpoint(s) antigo(s) removido(s).`, 'Fechar', { duration: 3500 });
        this.loadHistory();
      },
      error: (err) => {
        this.isPruning.set(false);
        this.log.error('Falha ao podar histórico', err, { rootId: this.data.rootId });
        this.snackBar.open('Falha ao limpar o histórico.', 'Fechar', { duration: 4000 });
      },
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
