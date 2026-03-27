import * as SQLite from 'expo-sqlite';
import type { Contact, ContactImage } from '../types';

const db = SQLite.openDatabaseSync('iris.db');

export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contact_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
  `);
}

export async function getAllContacts(): Promise<Contact[]> {
  return db.getAllAsync<Contact>('SELECT * FROM contacts ORDER BY name ASC');
}

export async function getContact(id: string): Promise<Contact | null> {
  return db.getFirstAsync<Contact>('SELECT * FROM contacts WHERE id = ?', [id]);
}

export async function upsertContact(id: string, name: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO contacts (id, name, synced) VALUES (?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, synced = 0`,
    [id, name]
  );
}

export async function deleteContact(id: string): Promise<void> {
  await db.runAsync('DELETE FROM contacts WHERE id = ?', [id]);
}

export async function markContactSynced(id: string): Promise<void> {
  await db.runAsync('UPDATE contacts SET synced = 1 WHERE id = ?', [id]);
}

export async function getContactImages(contactId: string): Promise<ContactImage[]> {
  return db.getAllAsync<ContactImage>(
    'SELECT * FROM contact_images WHERE contact_id = ?',
    [contactId]
  );
}

export async function replaceContactImages(contactId: string, imageUris: string[]): Promise<void> {
  await db.runAsync('DELETE FROM contact_images WHERE contact_id = ?', [contactId]);
  for (const uri of imageUris) {
    await db.runAsync(
      'INSERT INTO contact_images (contact_id, image_uri) VALUES (?, ?)',
      [contactId, uri]
    );
  }
}

export async function deleteContactImage(id: number): Promise<void> {
  await db.runAsync('DELETE FROM contact_images WHERE id = ?', [id]);
}
