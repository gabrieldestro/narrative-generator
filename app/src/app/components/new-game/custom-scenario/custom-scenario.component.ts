import { Component, Input, Output, EventEmitter, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import type { WorldTemplate } from '../../../core/models/world-template.model';

export interface CustomScenarioData {
  narrativeStyle: string;
  writingStyle: string;
  worldContext: string;
}

@Component({
  selector: 'ng-custom-scenario',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="custom-scenario">
      <h3>{{ baseTemplate ? 'Personalizar: ' + baseTemplate.name : 'Cenário Personalizado' }}</h3>
      @if (baseTemplate) {
        <p class="custom-scenario__hint">Os campos foram pré-preenchidos com os dados do mundo. Ajuste como desejar.</p>
      }

      <mat-form-field appearance="fill">
        <mat-label>Gênero</mat-label>
        <input matInput [(ngModel)]="narrativeStyle" placeholder="Ex: Fantasia Medieval, Cyberpunk Noir">
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Estilo de Escrita</mat-label>
        <input matInput [(ngModel)]="writingStyle" placeholder="Ex: Épico, Cômico, Terror Sombrio">
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Contexto do Mundo</mat-label>
        <textarea matInput [(ngModel)]="worldContext" placeholder="Descreva o mundo que você quer criar..." rows="5"></textarea>
        @if (!worldContext && submitted) {
          <mat-error>O contexto do mundo é obrigatório</mat-error>
        }
      </mat-form-field>

      <div class="custom-scenario__actions">
        <button mat-raised-button color="primary" (click)="onSubmit()" [disabled]="!worldContext.trim()">
          {{ baseTemplate ? 'Criar Jogo' : 'Gerar Mundo' }}
        </button>
        @if (baseTemplate) {
          <button mat-button (click)="clearBase()">Cancelar</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .custom-scenario { max-width: 600px; margin: 2rem auto; display: flex; flex-direction: column; gap: 1rem; }
    h3 { text-align: center; color: #c9a84c; }
    .custom-scenario__hint { text-align: center; color: #888; font-size: 0.85rem; }
    mat-form-field { width: 100%; }
    .custom-scenario__actions { display: flex; gap: 1rem; justify-content: center; }
    button { align-self: center; }
  `]
})
export class CustomScenarioComponent {
  @Input() baseTemplate: WorldTemplate | null = null;
  @Output() createCustom = new EventEmitter<CustomScenarioData>();
  @Output() cancelCustom = new EventEmitter<void>();

  narrativeStyle = '';
  writingStyle = '';
  worldContext = '';
  submitted = false;

  constructor() {
    effect(() => {
      const tpl = this.baseTemplate;
      if (tpl) {
        this.narrativeStyle = tpl.narrativeStyle ?? '';
        this.writingStyle = tpl.writingStyle ?? '';
        this.worldContext = tpl.worldContext ?? '';
        this.submitted = false;
      }
    });
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.worldContext.trim()) return;

    this.createCustom.emit({
      narrativeStyle: this.narrativeStyle,
      writingStyle: this.writingStyle,
      worldContext: this.worldContext,
    });
  }

  clearBase(): void {
    this.cancelCustom.emit();
  }
}
