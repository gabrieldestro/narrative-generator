import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { WorldTemplate } from '../../../core/models/world-template.model';

@Component({
  selector: 'ng-game-card',
  standalone: true,
  imports: [MatCardModule, MatChipsModule, MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-card.component.html',
  styleUrl: './game-card.component.scss',
})
export class GameCardComponent {
  @Input({ required: true }) world!: WorldTemplate;
  @Output() play = new EventEmitter<string>();
  @Output() useAsBase = new EventEmitter<WorldTemplate>();

  onPlay(): void {
    this.play.emit(this.world.id ?? this.world.name);
  }

  onUseAsBase(event: MouseEvent): void {
    event.stopPropagation();
    this.useAsBase.emit(this.world);
  }
}
