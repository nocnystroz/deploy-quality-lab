import { describe, expect, it } from 'vitest';
import { newProfile } from './defaults';
import { validateProfile } from './validation';

describe('validateProfile', () => {
  it('accepts the default profile', () => expect(validateProfile(newProfile())).toEqual([]));
  it('reports invalid urls and actions', () => {
    const profile = newProfile(); profile.urls = ['wat']; profile.actions = [{ type: 'click', selector: '', timeoutMs: 1 }];
    expect(validateProfile(profile)).toHaveLength(2);
  });
});
