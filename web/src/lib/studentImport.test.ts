import { describe, expect, it } from 'vitest';
import { validateRows } from './studentImport';
import { sections } from '../data/mock/seed';

const header = ['LRN', 'Last Name', 'First Name', 'Middle Name', 'Birthdate', 'Sex', 'Guardian Name', 'Guardian Mobile', 'Relationship', 'SMS Consent', 'Language', 'Section'];

describe('student import validation', () => {
  it('accepts good rows, links sections and flags problems', () => {
    const rows = validateRows([
      header,
      ['', 'Reyes', 'Ana', '', '2021-02-03', 'F', 'Liza Reyes', '9171112222', 'Mother', 'Yes', 'Filipino', 'Kindergarten I - Apple'],
      ['', 'Reyes', 'Ben', '', '03/04/2021', 'M', 'Liza Reyes', '0917 111 2222', 'Mother', 'No', '', ''],
      ['', '', 'NoLast', '', '2021-02-03', 'X', '', '123', '', '', '', 'Kinder Z'],
      ['', 'Reyes', 'Ana', '', '2021-02-03', 'F', 'Liza Reyes', '09171112222', 'Mother', 'Yes', '', ''],
    ], sections, []);
    expect(rows[0].input).toMatchObject({ guardianMobile: '+639171112222', sectionId: 'sec-apple', preferredLanguage: 'fil', smsConsent: true });
    expect(rows[1].input?.birthdate).toBe('2021-03-04');
    expect(rows[1].warnings.join()).toMatch(/consent/i);
    expect(rows[2].input).toBeUndefined();
    expect(rows[2].errors.length).toBeGreaterThanOrEqual(4);
    expect(rows[3].errors).toContain('Duplicate row in this file');
  });
});
