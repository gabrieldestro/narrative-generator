import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState } from '../../domain/types.js';
import { AdminCommandService } from '../../application/AdminCommandService.js';
import { GameManagementService } from '../../application/GameManagementService.js';

describe('AdminCommandService', () => {
  let adminService: AdminCommandService;
  let gameManagementService: GameManagementService;
  let sampleState: GameState;

  beforeEach(() => {
    gameManagementService = new GameManagementService(undefined as any);
    adminService = new AdminCommandService(gameManagementService);

    sampleState = {
      worldContext: 'Um reino em guerra',
      narrativeStyle: 'Fantasia Sombria',
      writingStyle: 'Emocional',
      turnNumber: 3,
      history: ['Turno 1: Começo', 'Turno 2: Exploração', 'Turno 3:\nNarrativa: Aria encontrou um baú misterioso.'],
      characters: [
        {
          id: '1',
          name: 'Aria',
          description: 'Guerreira valente',
          personality: 'Corajosa',
          currentLocation: 'floresta',
          isPlayer: true,
          inventory: ['Espada'],
          status: 'active'
        },
        {
          id: '2',
          name: 'Kael',
          description: 'Mago misterioso',
          personality: 'Sábio',
          currentLocation: 'torre',
          isPlayer: false,
          inventory: ['Cajado'],
          status: 'active'
        }
      ],
      locations: [
        {
          id: 'floresta',
          name: 'Floresta Antiga',
          description: 'Árvores altas e escuras',
          connectedTo: ['torre']
        },
        {
          id: 'torre',
          name: 'Torre Alta',
          description: 'Uma torre em ruínas',
          connectedTo: ['floresta']
        }
      ],
      concepts: [
        {
          id: 'magia_antiga',
          type: 'custom',
          name: 'Magia Antiga',
          description: 'Poder esquecido dos ancestrais'
        }
      ]
    };
  });

  it('should add and remove items from character inventory', async () => {
    const addResult = await adminService.execute(sampleState, {
      command: '/add-item',
      args: ['Aria', 'Poção de Vida']
    });

    expect(addResult.message).toContain('adicionado ao inventário de Aria');
    const aria = addResult.state.characters.find(c => c.name === 'Aria');
    expect(aria?.inventory).toContain('Poção de Vida');

    const removeResult = await adminService.execute(addResult.state, {
      command: '/remove-item',
      fields: { characterName: 'Aria', item: 'Poção de Vida' }
    });

    expect(removeResult.message).toContain('removido do inventário de Aria');
    const updatedAria = removeResult.state.characters.find(c => c.name === 'Aria');
    expect(updatedAria?.inventory).not.toContain('Poção de Vida');
  });

  it('should add and remove characters', async () => {
    const addResult = await adminService.execute(sampleState, {
      command: '/add-char',
      fields: {
        name: 'Lobo Cinzento',
        description: 'Um lobo feroz',
        personality: 'Selvagem',
        location: 'floresta'
      }
    });

    expect(addResult.message).toContain('adicionado com sucesso');
    const wolf = addResult.state.characters.find(c => c.name === 'Lobo Cinzento');
    expect(wolf).toBeDefined();
    expect(wolf?.isPlayer).toBe(false);

    const removeResult = await adminService.execute(addResult.state, {
      command: '/remove-char',
      args: ['Lobo Cinzento']
    });

    expect(removeResult.message).toContain('marcado como perdido');
    const updatedWolf = removeResult.state.characters.find(c => c.name === 'Lobo Cinzento');
    expect(updatedWolf?.status).toBe('lost');
  });

  it('should add and remove locations', async () => {
    const addResult = await adminService.execute(sampleState, {
      command: '/add-location',
      fields: {
        id: 'caverna',
        name: 'Caverna Profunda',
        description: 'Uma caverna úmida',
        connectedTo: ['floresta']
      }
    });

    expect(addResult.message).toContain('adicionado ao mapa');
    const cave = (addResult.state.locations ?? []).find(l => l.id === 'caverna');
    expect(cave).toBeDefined();

    const removeResult = await adminService.execute(addResult.state, {
      command: '/remove-location',
      args: ['caverna']
    });

    expect(removeResult.message).toContain('removido do mapa');
    const updatedLocations = removeResult.state.locations ?? [];
    expect(updatedLocations.find(l => l.id === 'caverna')).toBeUndefined();
  });

  it('should add and remove concepts', async () => {
    const addResult = await adminService.execute(sampleState, {
      command: '/add-concept',
      fields: {
        id: 'ordem_da_luz',
        type: 'faction',
        name: 'Ordem da Luz',
        description: 'Cavaleiros devotos'
      }
    });

    expect(addResult.message).toContain('adicionado com sucesso');
    const concept = (addResult.state.concepts ?? []).find(c => c.id === 'ordem_da_luz');
    expect(concept).toBeDefined();

    const removeResult = await adminService.execute(addResult.state, {
      command: '/remove-concept',
      args: ['ordem_da_luz']
    });

    expect(removeResult.message).toContain('removido');
    const updatedConcepts = removeResult.state.concepts ?? [];
    expect(updatedConcepts.find(c => c.id === 'ordem_da_luz')).toBeUndefined();
  });

  it('should return help text on /help', async () => {
    const result = await adminService.execute(sampleState, { command: '/help' });
    expect(result.message).toContain('/add-item');
    expect(result.message).toContain('/add-char');
  });
});
