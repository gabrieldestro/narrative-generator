import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { WorldListComponent } from './world-list/world-list.component';
import { CustomScenarioComponent, type CustomScenarioData } from './custom-scenario/custom-scenario.component';
import type { WorldTemplate } from '../core/models/world-template.model';

@Component({
  selector: 'ng-new-game',
  standalone: true,
  imports: [
    RouterLink,
    MatToolbarModule, MatButtonModule, MatProgressBarModule,
    WorldListComponent, CustomScenarioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar role="banner">
      <span>Narrative Generator</span>
      <span class="spacer"></span>
      <button mat-icon-button routerLink="/settings" aria-label="Configurações">
        ⚙
      </button>
    </mat-toolbar>

    <div class="new-game__content">
      <h1 class="section-title">NOVA AVENTURA</h1>
      <p class="ui-text--secondary">Escolha um Mundo Pré-Configurado</p>

      <ng-world-list (selectWorld)="onSelectWorld($event)" (useAsBase)="onUseAsBase($event)"/>

      <div class="new-game__divider" role="separator" aria-label="ou">— ou —</div>

      <ng-custom-scenario [baseTemplate]="baseTemplate()" (createCustom)="onCreateCustom($event)" (cancelCustom)="onCancelCustom()"/>
    </div>

    @if (isCreating()) {
      <mat-progress-bar mode="indeterminate" aria-label="Gerando mundo"/>
      <p class="new-game__loading-text">Gerando mundo...</p>
    }
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    .new-game__content { padding: 2rem; max-width: 960px; margin: 0 auto; }
    .new-game__divider { text-align: center; margin: 2rem 0; color: #666; }
    .new-game__loading-text { text-align: center; color: #c9a84c; margin-top: 0.5rem; }
  `]
})
export class NewGameComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly isCreating = signal(false);

  /** Template selecionado como base para preencher o formulário personalizado */
  readonly baseTemplate = signal<WorldTemplate | null>(null);

  onUseAsBase(world: WorldTemplate): void {
    this.baseTemplate.set(world);
  }

  onCancelCustom(): void {
    this.baseTemplate.set(null);
  }

  onSelectWorld(templateName: string): void {
    this.isCreating.set(true);
    this.api.createGame({ mode: 'template', templateName }).subscribe({
      next: (res) => {
        this.router.navigate(['/game', res.sessionId]);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.snackBar.open('Erro ao criar jogo: ' + (err.message ?? 'Erro desconhecido'), 'Fechar', { duration: 5000 });
      },
    });
  }

  onCreateCustom(data: CustomScenarioData): void {
    this.isCreating.set(true);
    const customPrompt = `Gênero: ${data.narrativeStyle || 'Personalizado'}\nEstilo: ${data.writingStyle || 'Livre'}\nContexto: ${data.worldContext}`;
    this.api.createGame({ mode: 'custom', customPrompt }).subscribe({
      next: (res) => {
        this.router.navigate(['/game', res.sessionId]);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.snackBar.open('Erro ao criar jogo: ' + (err.message ?? 'Erro desconhecido'), 'Fechar', { duration: 5000 });
      },
    });
  }
}
