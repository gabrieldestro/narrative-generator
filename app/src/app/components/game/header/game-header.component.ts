import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { GameStateService } from '../../../core/services/game-state.service';
import { SettingsService } from '../../../core/services/settings.service';
import { LoggingService } from '../../../core/services/logging.service';
import { AdminCommandDialogComponent } from '../admin-command/admin-command-dialog.component';

@Component({
  selector: 'ng-game-header',
  standalone: true,
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-header.component.html',
  styleUrl: './game-header.component.scss'
})
export class GameHeaderComponent {
  readonly gameState = inject(GameStateService);
  readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly log = inject(LoggingService);

  openAdminDialog(): void {
    this.log.debug('Abrindo painel de administração');
    this.dialog.open(AdminCommandDialogComponent, {
      width: '600px',
      panelClass: 'admin-dialog-container',
    });
  }

  toggleLeft(): void {
    this.log.debug('Toggle painel esquerdo');
    this.gameState.toggleLeftPanel();
  }

  toggleRight(): void {
    this.log.debug('Toggle painel direito');
    this.gameState.toggleRightPanel();
  }
}
