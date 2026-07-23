import { Component, Input, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'ng-collapsible-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="collapsible-panel"
      [class.collapsible-panel--collapsed]="collapsed()"
      [style.width]="collapsed() ? '0px' : width"
      role="complementary"
      [attr.aria-label]="title">
      <div class="collapsible-panel__header" (click)="toggle()" role="button" [attr.aria-expanded]="!collapsed()" tabindex="0" (keydown.enter)="toggle()" (keydown.space)="toggle(); $event.preventDefault()">
        <span class="collapsible-panel__icon" aria-hidden="true">{{ icon }}</span>
        <span class="collapsible-panel__title">{{ title }}</span>
        <button class="collapsible-panel__toggle" (click)="toggle(); $event.stopPropagation()" [attr.aria-label]="collapsed() ? 'Expandir painel' : 'Recolher painel'">
          {{ collapsed() ? '▶' : '◀' }}
        </button>
      </div>
      <div class="collapsible-panel__content" [class.collapsible-panel__content--hidden]="collapsed()">
        <ng-content></ng-content>
      </div>
    </aside>
  `,
  styles: [`
    .collapsible-panel {
      display: flex; flex-direction: column;
      background: #222; border-right: 1px solid #333;
      transition: width 250ms ease; overflow: hidden;
    }
    .collapsible-panel--collapsed { border-right: none; }
    .collapsible-panel__header {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.75rem; cursor: pointer; user-select: none;
      border-bottom: 1px solid #333; min-width: 200px;
    }
    .collapsible-panel__header:hover { background: #2a2a2a; }
    .collapsible-panel__icon { font-size: 1.2rem; }
    .collapsible-panel__title { flex: 1; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #a0a0a0; }
    .collapsible-panel__toggle { background: none; border: none; color: #a0a0a0; cursor: pointer; padding: 0; font-size: 0.8rem; }
    .collapsible-panel__content { flex: 1; overflow-y: auto; min-width: 200px; }
    .collapsible-panel__content--hidden { display: none; }
  `]
})
export class CollapsiblePanelComponent implements OnInit {
  @Input({ required: true }) title!: string;
  @Input() icon = '';
  @Input() width = '280px';
  @Input() defaultOpen = false;

  readonly collapsed = signal(true);

  ngOnInit(): void {
    this.collapsed.set(!this.defaultOpen);
  }

  toggle(): void {
    this.collapsed.update(v => !v);
  }
}
