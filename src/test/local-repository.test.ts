import { describe, expect, it } from 'vitest';
import {
  createLocalRepository,
  LOCAL_COLLECTIONS,
  LOCAL_SCHEMA_VERSION,
  LOCAL_STORAGE_KEY,
  type StorageAdapter,
} from '../lib/local-repository';

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('local repository', () => {
  it('creates, reads, updates, and deletes records', () => {
    const repository = createLocalRepository(new MemoryStorage());
    const created = repository.create('departments', { id: 'dept-test', name: 'Arts', code: 'ART' });
    expect(repository.get('departments', created.id)?.['name']).toBe('Arts');
    expect(repository.update('departments', created.id, { name: 'Fine Arts' })?.['name']).toBe('Fine Arts');
    expect(repository.delete('departments', created.id)).toBe(true);
    expect(repository.get('departments', created.id)).toBeNull();
    expect(repository.delete('departments', created.id)).toBe(false);
  });

  it('migrates a version 1 snapshot and adds collections introduced later', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      data: { institution: [{ id: 'legacy-school', name: 'Legacy School' }] },
    }));
    const repository = createLocalRepository(storage);
    const migrated = repository.read();
    expect(migrated.schemaVersion).toBe(LOCAL_SCHEMA_VERSION);
    expect(migrated.data.institution[0]?.['name']).toBe('Legacy School');
    for (const collection of LOCAL_COLLECTIONS) {
      expect(Array.isArray(migrated.data[collection])).toBe(true);
    }
  });

  it('seeds and restores the labelled sample dataset', () => {
    const repository = createLocalRepository(new MemoryStorage());
    expect(repository.read().seeded).toBe(true);
    repository.create('students', { id: 'student-extra', fullName: 'Extra Student' });
    const reset = repository.resetSampleData();
    expect(reset.seeded).toBe(true);
    expect(repository.get('students', 'student-extra')).toBeNull();
    expect(repository.list('exams')).toHaveLength(2);
    expect(repository.list('teachers').length).toBeGreaterThan(0);
  });

  it('exports and imports a validated JSON backup', () => {
    const source = createLocalRepository(new MemoryStorage());
    source.create('courses', { id: 'course-extra', code: 'ART101', title: 'Art' });
    const destination = createLocalRepository(new MemoryStorage());
    const imported = destination.importJson(source.exportJson());
    expect(imported.seeded).toBe(false);
    expect(destination.get('courses', 'course-extra')?.['title']).toBe('Art');
    expect(() => destination.importJson('{not json')).toThrow();
  });
});
