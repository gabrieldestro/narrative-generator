import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../services/api.service';
import { GameStateService } from '../services/game-state.service';

@Injectable({ providedIn: 'root' })
export class SessionGuard implements CanActivate {
  private readonly api = inject(ApiService);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const sessionId = route.paramMap.get('sessionId')!;

    // O estado já está fresco no serviço (ex.: pós-turno: setTurnResult/
    // setObservation/setNarration/applyAdminResult atualizam sessionId +
    // gameState e depois navegam para o novo checkpoint). Refetchar aqui
    // chamaria setGameState(), que zera o contexto transitório do turno
    // (stepTrace, turnDebugHistory) — só a narrativa central (history,
    // persistido no GameState) sobreviveria. Evita o GET redundante.
    if (this.gameState.sessionId() === sessionId && this.gameState.gameState() !== null) {
      return of(true);
    }

    return this.api.getGameState(sessionId).pipe(
      map(response => {
        this.gameState.setGameState(sessionId, response.state);
        return true;
      }),
      catchError(() => of(this.router.parseUrl('/new-game'))),
    );
  }
}
