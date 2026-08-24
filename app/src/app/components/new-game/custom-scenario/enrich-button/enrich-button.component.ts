import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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

  @Input() field = '';
  @Input() value = '';
  @Input() getContext: () => WorldTemplate | null = () => null;
  @Output() enriched = new EventEmitter<string>();

  readonly loading = signal(false);

  onEnrich(): void {
    if (this.loading()) return;
    this.loading.set(true);
    const context = this.getContext();
    this.enrich
      .enrichField({ field: this.field, value: this.value, context: context ?? undefined })
      .subscribe({
        next: (res) => {
          this.enriched.emit(res.enriched);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
