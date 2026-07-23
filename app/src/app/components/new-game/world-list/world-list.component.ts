import { Component, inject, Output, EventEmitter, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { GameCardComponent } from '../../../shared/components/game-card/game-card.component';
import type { WorldTemplate } from '../../../core/models/world-template.model';

@Component({
  selector: 'ng-world-list',
  standalone: true,
  imports: [GameCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './world-list.component.html',
  styleUrl: './world-list.component.scss',
})
export class WorldListComponent implements OnInit {
  private readonly api = inject(ApiService);
  @Output() selectWorld = new EventEmitter<string>();
  @Output() useAsBase = new EventEmitter<WorldTemplate>();

  readonly worlds = signal<WorldTemplate[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadWorlds();
  }

  loadWorlds(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listWorlds().subscribe({
      next: (worlds) => {
        this.worlds.set(worlds);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Não foi possível carregar os mundos. Verifique se a API está rodando.');
      },
    });
  }

  onPlayWorld(templateName: string): void {
    this.selectWorld.emit(templateName);
  }

  onUseAsBase(world: WorldTemplate): void {
    this.useAsBase.emit(world);
  }
}
