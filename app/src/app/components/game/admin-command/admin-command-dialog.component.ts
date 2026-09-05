import { Component, inject, signal, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { LoggingService } from '../../../core/services/logging.service';
import type { ExtractedCharacterSheet } from '../../../core/models/api-payloads.model';

@Component({
  selector: 'ng-admin-command-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './admin-command-dialog.component.html',
  styleUrl: './admin-command-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCommandDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  readonly gameState = inject(GameStateService);
  private readonly log = inject(LoggingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<AdminCommandDialogComponent>);

  readonly isSubmitting = signal(false);
  readonly extractedSheet = signal<ExtractedCharacterSheet | null>(null);

  // Forms
  readonly itemForm = this.fb.group({
    action: ['add', Validators.required],
    characterName: ['', Validators.required],
    itemName: ['', Validators.required],
  });

  readonly charForm = this.fb.group({
    action: ['add', Validators.required],
    characterName: [''], // usado para remover
    name: [''],
    description: [''],
    personality: [''],
    location: [''],
  });

  readonly locationForm = this.fb.group({
    action: ['add', Validators.required],
    locationId: [''], // usado para remover
    id: [''],
    name: [''],
    description: [''],
    connectedTo: [''],
  });

  readonly conceptForm = this.fb.group({
    action: ['add', Validators.required],
    conceptId: [''], // usado para remover
    id: [''],
    type: ['custom'],
    name: [''],
    description: [''],
  });

  readonly extractCharForm = this.fb.group({
    charName: ['', Validators.required],
    turnsCount: [0],
  });

  readonly activeCharacters = computed(() => this.gameState.characters());
  readonly activeLocations = computed(() => this.gameState.locations());
  readonly activeConcepts = computed(() => this.gameState.concepts());

  private getSessionId(): string | null {
    return this.gameState.sessionId();
  }

  submitItem(): void {
    const sessionId = this.getSessionId();
    if (!sessionId || this.itemForm.invalid) return;

    const { action, characterName, itemName } = this.itemForm.value;
    const command = action === 'add' ? '/add-item' : '/remove-item';

    this.isSubmitting.set(true);
    this.apiService.executeCommand(sessionId, {
      command,
      fields: { characterName, item: itemName },
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
        this.itemForm.patchValue({ itemName: '' });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao executar comando de item', err);
        this.snackBar.open('Erro ao executar comando de item', 'Fechar', { duration: 4000 });
      }
    });
  }

  submitChar(): void {
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    const val = this.charForm.value;
    const isAdd = val.action === 'add';
    const command = isAdd ? '/add-char' : '/remove-char';

    if (isAdd && !val.name?.trim()) {
      this.snackBar.open('Informe o nome do personagem', 'OK', { duration: 3000 });
      return;
    }

    if (!isAdd && !val.characterName) {
      this.snackBar.open('Selecione o personagem a remover', 'OK', { duration: 3000 });
      return;
    }

    this.isSubmitting.set(true);
    const fields = isAdd
      ? {
          name: val.name,
          description: val.description,
          personality: val.personality,
          location: val.location,
        }
      : {
          characterName: val.characterName,
        };

    this.apiService.executeCommand(sessionId, {
      command,
      fields,
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
        if (isAdd) {
          this.charForm.patchValue({ name: '', description: '', personality: '', location: '' });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao executar comando de personagem', err);
        this.snackBar.open('Erro ao executar comando de personagem', 'Fechar', { duration: 4000 });
      }
    });
  }

  submitLocation(): void {
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    const val = this.locationForm.value;
    const isAdd = val.action === 'add';
    const command = isAdd ? '/add-location' : '/remove-location';

    if (isAdd && (!val.id?.trim() || !val.name?.trim())) {
      this.snackBar.open('ID e Nome do local são obrigatórios', 'OK', { duration: 3000 });
      return;
    }

    if (!isAdd && !val.locationId) {
      this.snackBar.open('Selecione o local a remover', 'OK', { duration: 3000 });
      return;
    }

    this.isSubmitting.set(true);
    const fields = isAdd
      ? {
          id: val.id,
          name: val.name,
          description: val.description,
          connectedTo: val.connectedTo
            ? val.connectedTo.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
            : [],
        }
      : {
          id: val.locationId,
        };

    this.apiService.executeCommand(sessionId, {
      command,
      fields,
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
        if (isAdd) {
          this.locationForm.patchValue({ id: '', name: '', description: '', connectedTo: '' });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao executar comando de local', err);
        this.snackBar.open('Erro ao executar comando de local', 'Fechar', { duration: 4000 });
      }
    });
  }

  submitConcept(): void {
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    const val = this.conceptForm.value;
    const isAdd = val.action === 'add';
    const command = isAdd ? '/add-concept' : '/remove-concept';

    if (isAdd && (!val.id?.trim() || !val.name?.trim())) {
      this.snackBar.open('ID e Nome do conceito são obrigatórios', 'OK', { duration: 3000 });
      return;
    }

    if (!isAdd && !val.conceptId) {
      this.snackBar.open('Selecione o conceito a remover', 'OK', { duration: 3000 });
      return;
    }

    this.isSubmitting.set(true);
    const fields = isAdd
      ? {
          id: val.id,
          type: val.type,
          name: val.name,
          description: val.description,
        }
      : {
          id: val.conceptId,
        };

    this.apiService.executeCommand(sessionId, {
      command,
      fields,
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
        if (isAdd) {
          this.conceptForm.patchValue({ id: '', name: '', description: '' });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao executar comando de conceito', err);
        this.snackBar.open('Erro ao executar comando de conceito', 'Fechar', { duration: 4000 });
      }
    });
  }

  triggerExtract(): void {
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    this.isSubmitting.set(true);
    this.apiService.executeCommand(sessionId, { command: '/extract' }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro na extração de estado', err);
        this.snackBar.open('Erro na extração de estado', 'Fechar', { duration: 4000 });
      }
    });
  }

  extractCharacterSheet(): void {
    const sessionId = this.getSessionId();
    if (!sessionId || this.extractCharForm.invalid) return;

    const { charName, turnsCount } = this.extractCharForm.value;
    this.isSubmitting.set(true);
    this.extractedSheet.set(null);

    this.apiService.executeCommand(sessionId, {
      command: '/extract-char',
      fields: {
        charName,
        turnsCount: Number(turnsCount) || 0,
      }
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        const payload = res.payload as { sheet?: ExtractedCharacterSheet } | undefined;
        if (payload?.sheet) {
          this.extractedSheet.set(payload.sheet);
          this.snackBar.open('Ficha gerada com sucesso pelo LLM!', 'OK', { duration: 3000 });
        } else {
          this.snackBar.open(res.message, 'OK', { duration: 4000 });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao extrair ficha de personagem', err);
        this.snackBar.open('Erro ao extrair ficha de personagem', 'Fechar', { duration: 4000 });
      }
    });
  }

  confirmAddExtractedChar(): void {
    const sheet = this.extractedSheet();
    const sessionId = this.getSessionId();
    if (!sheet || !sessionId) return;

    this.isSubmitting.set(true);
    this.apiService.executeCommand(sessionId, {
      command: '/add-char',
      fields: {
        name: sheet.name,
        description: sheet.description,
        personality: sheet.personality,
        location: sheet.currentLocation,
      }
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.extractedSheet.set(null);
        this.gameState.applyAdminResult(res);
        this.snackBar.open(res.message, 'OK', { duration: 4000 });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.log.error('Erro ao adicionar personagem extraído', err);
        this.snackBar.open('Erro ao adicionar personagem extraído', 'Fechar', { duration: 4000 });
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
