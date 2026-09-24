import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EnrichService } from '../../../../core/services/enrich.service';
import type { WorldTemplate } from '../../../../core/models/world-template.model';

@Component({
  selector: 'ng-enrich-button',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatProgressSpinnerModule],
  templateUrl: './enrich-button.component.html',
  styleUrl: './enrich-button.component.scss',
})
export class EnrichButtonComponent {
  private readonly enrich = inject(EnrichService);
  private readonly snackBar = inject(MatSnackBar, { optional: true });

  @Input() field = '';
  @Input() value = '';
  @Input() getContext: () => WorldTemplate | null = () => null;
  @Output() enriched = new EventEmitter<string>();

  readonly loading = signal(false);
  readonly summarizing = signal(false);

  get isBusy(): boolean {
    return this.loading() || this.summarizing();
  }

  get canSummarize(): boolean {
    return !!this.value?.trim() && !this.isBusy;
  }

  onEnrich(): void {
    if (this.isBusy) return;
    this.loading.set(true);
    const context = this.getContext();
    this.enrich
      .enrichField({ field: this.field, value: this.value, context: context ?? undefined })
      .subscribe({
        next: (res) => {
          this.enriched.emit(res.enriched);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar?.open('Falha ao enriquecer — mantido o texto original.', 'Fechar', { duration: 4000 });
        },
      });
  }

  onSummarize(): void {
    if (this.isBusy || !this.value?.trim()) return;
    this.summarizing.set(true);
    const context = this.getContext();
    this.enrich
      .summarizeField({ field: this.field, value: this.value, context: context ?? undefined })
      .subscribe({
        next: (res) => {
          this.enriched.emit(res.enriched);
          this.summarizing.set(false);
        },
        error: () => {
          this.summarizing.set(false);
          this.snackBar?.open('Falha ao resumir — mantido o texto original.', 'Fechar', { duration: 4000 });
        },
      });
  }
}
