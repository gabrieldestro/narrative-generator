import { Component, OnInit, inject } from '@angular/core';
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
import { DEFAULT_GAME_SETTINGS, type GameSettings } from '../../core/models/game-settings.model';

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
export class SettingsComponent implements OnInit {
  readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  /** Rascunho editável — só vai ao localStorage no Salvar. Sair sem salvar descarta. */
  draft: GameSettings = { ...DEFAULT_GAME_SETTINGS };

  ngOnInit(): void {
    this.draft = { ...this.settingsService.settings() };
  }

  update(key: string, value: unknown): void {
    this.draft = { ...this.draft, [key]: value };
  }

  get isDirty(): boolean {
    return JSON.stringify(this.draft) !== JSON.stringify(this.settingsService.settings());
  }

  saveSettings(): void {
    this.settingsService.saveAll({ ...this.draft });
    this.snackBar.open('Configurações salvas!', 'Fechar', { duration: 3000 });
  }

  cancelChanges(): void {
    this.draft = { ...this.settingsService.settings() };
    this.snackBar.open('Alterações descartadas.', 'Fechar', { duration: 3000 });
  }

  resetDefaults(): void {
    this.draft = { ...DEFAULT_GAME_SETTINGS };
    this.snackBar.open('Padrões restaurados — clique em Salvar para aplicar.', 'Fechar', { duration: 3000 });
  }
}
