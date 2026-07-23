import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../../core/services/settings.service';
import type { GameSettings } from '../core/models/game-settings.model';

@Component({
  selector: 'ng-settings',
  standalone: true,
  imports: [
    RouterLink, FormsModule,
    MatToolbarModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule,
    MatRadioModule, MatSliderModule, MatSlideToggleModule,
  ],
  template: `
    <mat-toolbar>
      <span>Narrative Generator</span>
      <span class="spacer"></span>
      <button mat-icon-button routerLink="/new-game">
        ←
      </button>
    </mat-toolbar>

    <div class="settings__content">
      <h1 class="section-title">CONFIGURAÇÕES</h1>

      <mat-card class="settings__section">
        <mat-card-header><mat-card-title>Jogo</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="settings__field">
            <label>Tamanho da Narração</label>
            <mat-radio-group [ngModel]="settingsService.settings().narrationSize" (ngModelChange)="update('narrationSize', $event)">
              <mat-radio-button value="concise">Conciso (1-2 pars)</mat-radio-button>
              <mat-radio-button value="balanced">Equilibrado (3-4 pars)</mat-radio-button>
              <mat-radio-button value="descriptive">Detalhado (5+ pars)</mat-radio-button>
            </mat-radio-group>
          </div>

          <div class="settings__field">
            <label>Eventos Inesperados: {{ settingsService.settings().unexpectedEventChance * 100 }}%</label>
            <mat-slider min="0" max="50" step="5">
              <input matSliderThumb [value]="settingsService.settings().unexpectedEventChance * 100" (valueChange)="update('unexpectedEventChance', $event / 100)">
            </mat-slider>
          </div>

          <div class="settings__field">
            <label>Janela de Memória</label>
            <mat-radio-group [ngModel]="settingsService.settings().memoryWindowSize" (ngModelChange)="update('memoryWindowSize', $event)">
              <mat-radio-button [value]="2">2 turnos</mat-radio-button>
              <mat-radio-button [value]="5">5 turnos (recomendado)</mat-radio-button>
              <mat-radio-button [value]="10">10 turnos</mat-radio-button>
              <mat-radio-button [value]="15">15 turnos</mat-radio-button>
              <mat-radio-button [value]="20">20 turnos</mat-radio-button>
            </mat-radio-group>
          </div>

          <div class="settings__field">
            <mat-slide-toggle [checked]="settingsService.settings().debug" (change)="update('debug', $event.checked)">
              Modo Debug
            </mat-slide-toggle>
          </div>

          <div class="settings__field">
            <mat-slide-toggle [checked]="settingsService.settings().godMode" (change)="update('godMode', $event.checked)">
              God Mode (dados sempre 20)
            </mat-slide-toggle>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="settings__section">
        <mat-card-header><mat-card-title>Conexão com o LLM</mat-card-title></mat-card-header>
        <mat-card-content>
          <mat-form-field appearance="fill">
            <mat-label>URL da API</mat-label>
            <input matInput [ngModel]="settingsService.settings().apiUrl" (ngModelChange)="update('apiUrl', $event)" placeholder="http://localhost:1234/v1">
          </mat-form-field>
          <mat-form-field appearance="fill">
            <mat-label>Modelo</mat-label>
            <input matInput [ngModel]="settingsService.settings().model" (ngModelChange)="update('model', $event)" placeholder="gemma-4b">
          </mat-form-field>
          <mat-form-field appearance="fill">
            <mat-label>API Token (opcional)</mat-label>
            <input matInput type="password" [ngModel]="settingsService.settings().apiToken" (ngModelChange)="update('apiToken', $event)" placeholder="Token de autenticação">
          </mat-form-field>
          <button mat-stroked-button (click)="testConnection()">Testar Conexão</button>
        </mat-card-content>
      </mat-card>

      <mat-card class="settings__section">
        <mat-card-header><mat-card-title>Sobre</mat-card-title></mat-card-header>
        <mat-card-content>
          <p>Narrative Generator v1.0</p>
          <p>Motor configurável com suporte a múltiplos modelos de linguagem.</p>
        </mat-card-content>
      </mat-card>

      <div class="settings__actions">
        <button mat-raised-button color="primary" (click)="saveSettings()">Salvar Configurações</button>
      </div>
    </div>
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    .settings__content { max-width: 640px; margin: 0 auto; padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
    .settings__section { background: #222; }
    .settings__field { margin: 1rem 0; }
    .settings__field label { display: block; font-size: 0.875rem; color: #a0a0a0; margin-bottom: 0.5rem; font-weight: 600; }
    .settings__field mat-radio-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .settings__field mat-slider { width: 100%; }
    .settings__actions { text-align: center; }
    mat-form-field { width: 100%; }
  `]
})
export class SettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  update<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settingsService.updateSetting(key, value);
  }

  saveSettings(): void {
    this.snackBar.open('Configurações salvas!', 'Fechar', { duration: 3000 });
  }

  testConnection(): void {
    this.snackBar.open('Teste de conexão não implementado (requer chamada HTTP)', 'Fechar', { duration: 3000 });
  }
}
