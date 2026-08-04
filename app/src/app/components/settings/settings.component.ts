import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../../core/services/settings.service';
import type { GameSettings } from '../../core/models/game-settings.model';

@Component({
  selector: 'ng-settings',
  standalone: true,
  imports: [
    RouterLink, FormsModule,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule,
    MatRadioModule, MatSliderModule, MatSlideToggleModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  update(key: string, value: unknown): void {
    this.settingsService.updateSetting(key as keyof GameSettings, value as never);
  }

  saveSettings(): void {
    this.snackBar.open('Configurações salvas!', 'Fechar', { duration: 3000 });
  }

  testConnection(): void {
    this.snackBar.open('Teste de conexão não implementado (requer chamada HTTP)', 'Fechar', { duration: 3000 });
  }
}
