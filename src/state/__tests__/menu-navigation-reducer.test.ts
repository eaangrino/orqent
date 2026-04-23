import { describe, expect, it } from 'vitest';
import {
  createInitialMenuNavigationState,
  menuNavigationReducer,
} from '../menu-navigation-reducer.js';

describe('menuNavigationReducer', () => {
  it('inicia en el primer item y primera pantalla', () => {
    const result = createInitialMenuNavigationState();

    expect(result).toEqual({
      selectedIndex: 0,
      activeScreen: 'dashboard',
    });
  });

  it('mueve hacia abajo', () => {
    const initial = createInitialMenuNavigationState();

    const result = menuNavigationReducer(initial, { type: 'move_down' });

    expect(result.selectedIndex).toBe(1);
    expect(result.activeScreen).toBe('dashboard');
  });

  it('mueve hacia arriba con wrap desde 0', () => {
    const initial = createInitialMenuNavigationState();

    const result = menuNavigationReducer(initial, { type: 'move_up' });

    expect(result.selectedIndex).toBe(2);
    expect(result.activeScreen).toBe('dashboard');
  });

  it('mueve hacia abajo con wrap desde el último índice', () => {
    const initial = {
      selectedIndex: 2,
      activeScreen: 'dashboard' as const,
    };

    const result = menuNavigationReducer(initial, { type: 'move_down' });

    expect(result.selectedIndex).toBe(0);
    expect(result.activeScreen).toBe('dashboard');
  });

  it('activa la pantalla del índice seleccionado', () => {
    const initial = {
      selectedIndex: 1,
      activeScreen: 'dashboard' as const,
    };

    const result = menuNavigationReducer(initial, { type: 'activate_selected' });

    expect(result.selectedIndex).toBe(1);
    expect(result.activeScreen).toBe('tasks');
  });

  it('activa configuración cuando el índice seleccionado es 2', () => {
    const initial = {
      selectedIndex: 2,
      activeScreen: 'dashboard' as const,
    };

    const result = menuNavigationReducer(initial, { type: 'activate_selected' });

    expect(result.activeScreen).toBe('settings');
  });

  it('activa dashboard cuando el índice seleccionado es 0', () => {
    const initial = {
      selectedIndex: 0,
      activeScreen: 'tasks' as const,
    };

    const result = menuNavigationReducer(initial, { type: 'activate_selected' });

    expect(result.selectedIndex).toBe(0);
    expect(result.activeScreen).toBe('dashboard');
  });
});