import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { EnrichService } from './enrich.service';
import { ApiService } from './api.service';
import type { EnrichResponse } from '../models/api-payloads.model';

describe('EnrichService', () => {
  let service: EnrichService;
  const apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['enrichField']);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EnrichService, { provide: ApiService, useValue: apiSpy }],
    });
    service = TestBed.inject(EnrichService);
  });

  it('retorna o texto enriquecido do backend', () => {
    apiSpy.enrichField.and.returnValue(of({ enriched: 'texto rico' }));
    let result: EnrichResponse | undefined;
    service.enrichField({ field: 'Descrição', value: 'texto' }).subscribe((r) => (result = r));
    expect(apiSpy.enrichField).toHaveBeenCalled();
    expect(result?.enriched).toBe('texto rico');
  });

  it('mantém o valor original em caso de erro de rede/LLM', () => {
    apiSpy.enrichField.and.returnValue(throwError(() => new Error('falha')));
    let result: EnrichResponse | undefined;
    service.enrichField({ field: 'Descrição', value: 'original' }).subscribe((r) => (result = r));
    expect(result?.enriched).toBe('original');
  });
});
