import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { LoggingService } from '../../core/services/logging.service';
import { WorldListComponent } from './world-list/world-list.component';
import type { WorldTemplate } from '../../core/models/world-template.model';

@Component({
  selector: 'ng-new-game',
  standalone: true,
  imports: [
    RouterLink,
    MatToolbarModule, MatButtonModule, MatProgressSpinnerModule,
    WorldListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-game.component.html',
  styleUrl: './new-game.component.scss',
})
export class NewGameComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly log = inject(LoggingService);

  readonly isCreating = signal(false);

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
