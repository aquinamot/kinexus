import { describe, it, expect } from 'vitest';
import { normalize, findExactMatch, findClosestMatches, type CatalogExercise } from '../../src/exercises/match';

const catalog: CatalogExercise[] = [
  { id: 1, name: 'Supino reto com barra' },
  { id: 2, name: 'Supino inclinado com halteres' },
  { id: 3, name: 'Agachamento livre' },
];

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Supino Reto Com Barra')).toBe('supino reto com barra');
    expect(normalize('Agachamento')).toBe('agachamento');
  });
});

describe('findExactMatch', () => {
  it('matches ignoring case and accents', () => {
    const match = findExactMatch('SUPINO RETO COM BARRA', catalog);
    expect(match?.id).toBe(1);
  });

  it('returns null when nothing matches exactly', () => {
    expect(findExactMatch('Rosca direta', catalog)).toBeNull();
  });
});

describe('findClosestMatches', () => {
  it('ranks the closest name first', () => {
    const results = findClosestMatches('Supino reto com halteres', catalog);
    expect(results[0].exercise.id).toBe(1);
  });

  it('filters out very dissimilar names', () => {
    const results = findClosestMatches('xyz completely unrelated text', catalog);
    expect(results).toHaveLength(0);
  });
});
