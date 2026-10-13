import { describe, it, expect } from 'vitest';
import { isEmptyText, isMissingTexts, missingTextFields, pickFieldsToSave, type TextFields } from '../bulkFields';

const gen: TextFields = {
  name: 'Vltavín kapka', nameEn: 'Moldavite drop', description: 'Popis', descriptionEn: 'Desc',
  longDescription: '<p>Dlouhý</p>', longDescriptionEn: '<p>Long</p>',
};

describe('isEmptyText', () => {
  it('prázdný editor „<p></p>" a &nbsp; jsou prázdné', () => {
    expect(isEmptyText('<p></p>')).toBe(true);
    expect(isEmptyText('<p>&nbsp;</p>')).toBe(true);
    expect(isEmptyText(null)).toBe(true);
    expect(isEmptyText('<p>text</p>')).toBe(false);
  });
});

describe('missingTextFields / isMissingTexts', () => {
  it('vyjmenuje prázdná pole', () => {
    expect(missingTextFields({ name: 'A', nameEn: '', description: 'x', descriptionEn: null, longDescription: '<p></p>', longDescriptionEn: 'y' }))
      .toEqual(['nameEn', 'descriptionEn', 'longDescription']);
    expect(isMissingTexts(gen)).toBe(false);
  });
});

describe('pickFieldsToSave', () => {
  it('bez overwrite plní jen prázdná pole', () => {
    const cur = { name: 'Můj název', nameEn: '', description: 'Můj popis', descriptionEn: '', longDescription: '', longDescriptionEn: '' };
    expect(Object.keys(pickFieldsToSave(cur, gen, false))).toEqual(['nameEn', 'descriptionEn', 'longDescription', 'longDescriptionEn']);
  });
  it('s overwrite přepíše vše, ale prázdný výstup AI existující text nesmaže', () => {
    const cur = { name: 'Můj název', nameEn: 'x', description: 'y', descriptionEn: 'z', longDescription: 'a', longDescriptionEn: 'b' };
    const out = pickFieldsToSave(cur, { ...gen, nameEn: '' }, true);
    expect(out.name).toBe('Vltavín kapka');
    expect(out.nameEn).toBeUndefined();
  });
  it('kámen s kompletními texty → nic k uložení (přeskočí se)', () => {
    expect(pickFieldsToSave(gen, gen, false)).toEqual({});
  });
});
