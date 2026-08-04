import { Component, Input, Output, EventEmitter, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { WorldTemplate } from '../../../core/models/world-template.model';

export interface CustomScenarioData {
  narrativeStyle: string;
  writingStyle: string;
  worldContext: string;
}

@Component({
  selector: 'ng-custom-scenario',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './custom-scenario.component.html',
  styleUrl: './custom-scenario.component.scss',
})
export class CustomScenarioComponent {
  @Input() baseTemplate: WorldTemplate | null = null;
  @Output() createCustom = new EventEmitter<CustomScenarioData>();
  @Output() cancelCustom = new EventEmitter<void>();

  narrativeStyle = '';
  writingStyle = '';
  worldContext = '';
  submitted = false;

  get isEditing(): boolean {
    return !!this.baseTemplate;
  }

  get previewTitle(): string {
    return this.narrativeStyle || 'Seu Mundo';
  }

  get previewStyle(): string {
    return this.writingStyle || 'Estilo livre';
  }

  get previewContext(): string {
    if (!this.worldContext) return 'O contexto do seu mundo aparecerá aqui conforme você escreve...';
    return this.worldContext.length > 280
      ? this.worldContext.slice(0, 280) + '…'
      : this.worldContext;
  }

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
