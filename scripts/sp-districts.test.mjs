import { describe, expect, it } from 'vitest';
import { districtAt, districtNames } from './sp-districts.mjs';

describe('distritos oficiais de São Paulo', () => {
  it('contém os 96 distritos e classifica coordenadas dentro da cidade', () => {
    expect(districtNames).toHaveLength(96);
    expect(districtAt(-23.5475, -46.6329)).toBe('Sé');
    expect(districtAt(-23.537, -46.569)).toBe('Tatuapé');
  });

  it('não confunde um local de outra cidade com São Paulo', () => {
    expect(districtAt(0.04004, -51.05303)).toBeNull();
    expect(districtAt(null, null)).toBeNull();
  });
});
