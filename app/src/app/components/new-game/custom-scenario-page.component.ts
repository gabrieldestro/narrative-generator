import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { LoggingService } from '../../core/services/logging.service';
import { CustomScenarioComponent, type CustomScenarioData } from './custom-scenario/custom-scenario.component';
import type { WorldTemplate } from '../../core/models/world-template.model';

@Component({
  selector: 'ng-custom-scenario-page',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatProgressSpinnerModule,
    CustomScenarioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './custom-scenario-page.component.html',
  styleUrl: './custom-scenario-page.component.scss',
})
export class CustomScenarioPageComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);

  readonly isCreating = signal(false);
  readonly baseTemplate = signal<WorldTemplate | null>(null);

  constructor() {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras.state as { baseTemplate?: WorldTemplate } | null;
    if (state?.baseTemplate) {
      this.baseTemplate.set(state.baseTemplate);
    }
  }

  goBack(): void {
    if (this.isCreating()) return;
    this.router.navigate(['/new-game']);
  }

  onCreateCustom(data: CustomScenarioData): void {
    this.log.info('Criando jogo a partir de cenário customizado', { narrativeStyle: data.narrativeStyle, writingStyle: data.writingStyle });
    this.isCreating.set(true);
    const customPrompt = `Gênero: ${data.narrativeStyle || 'Personalizado'}\nEstilo: ${data.writingStyle || 'Livre'}\nContexto: ${data.worldContext}`;
    this.api.createGame({ mode: 'custom', customPrompt }).subscribe({
      next: (res) => {
        this.log.info('Jogo customizado criado com sucesso', { sessionId: res.sessionId });
        this.router.navigate(['/game', res.sessionId]);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.log.error('Erro ao criar jogo (custom)', err);
        this.snackBar.open('Erro ao criar jogo: ' + (err.message ?? 'Erro desconhecido'), 'Fechar', { duration: 5000 });
      },
    });
  }
}
