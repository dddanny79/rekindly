import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Db } from '../db/client';
import { files } from '../db/schema';
import { DomainError } from '../lib/errors';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const PHOTO_SIZE = 512;

export const fileUrl = (id: string | null) => (id ? `/api/v1/files/${id}` : null);

/**
 * Normalizes an uploaded photo: applies the EXIF orientation, scales it to fit
 * 512×512, re-encodes it as JPEG without metadata (EXIF/GPS are dropped).
 */
export async function storePhoto(db: Db, dataDir: string, input: Buffer) {
  let output: Buffer;
  try {
    output = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new DomainError(400, 'invalid_image');
  }
  const id = crypto.randomUUID();
  const path = `${id}.jpg`;
  await writeFile(join(dataDir, 'files', path), output);
  return db
    .insert(files)
    .values({
      id,
      path,
      mime: 'image/jpeg',
      size: output.length,
      sha256: createHash('sha256').update(output).digest('hex'),
    })
    .returning()
    .get();
}

/** Removes a replaced or removed photo (an edit of the person, not deleted data). */
export async function removeFile(db: Db, dataDir: string, id: string) {
  const row = db.select().from(files).where(eq(files.id, id)).get();
  if (!row) return;
  db.delete(files).where(eq(files.id, id)).run();
  await rm(join(dataDir, 'files', row.path), { force: true });
}

export async function readStoredFile(db: Db, dataDir: string, id: string) {
  const row = db.select().from(files).where(eq(files.id, id)).get();
  if (!row) return null;
  try {
    return { row, data: await readFile(join(dataDir, 'files', row.path)) };
  } catch {
    return null;
  }
}
