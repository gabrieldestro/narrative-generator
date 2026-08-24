import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import type { EnrichPayload, EnrichResponse } from '../models/api-payloads.model';

@Injectable({ providedIn: 'root' })
export class EnrichService {
  private readonly api = inject(ApiService);

  enrichField(payload: EnrichPayload): Observable<EnrichResponse> {
    return this.api.enrichField(payload).pipe(
      catchError((err) => {
        // Em caso de falha (rede/LLM), devolve o valor original para não quebrar o fluxo do usuário.
        console.error('EnrichService: falha ao enriquecer campo, mantendo valor original', err);
        return of({ enriched: payload.value });
      }),
    );
  }
}
