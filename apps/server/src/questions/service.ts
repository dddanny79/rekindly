import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Entry, Question } from '@app/shared';
import type { Db } from '../db/client';
import { questions } from '../db/schema';
import { createEntry } from '../entries/service';
import { notFound } from '../lib/errors';
import { notDeleted, nowIso } from '../lib/sql';
import { getLivePerson, touchPerson } from '../people/refs';

const toQuestion = (row: typeof questions.$inferSelect): Question => ({
  id: row.id,
  text: row.text,
  sort: row.sort,
  createdAt: row.createdAt,
});

const open = (personId: string) =>
  and(eq(questions.personId, personId), notDeleted(questions), isNull(questions.askedAt));

/** Open questions of a person, in their order. */
export function listQuestions(db: Db, personId: string): Question[] {
  return db
    .select()
    .from(questions)
    .where(open(personId))
    .orderBy(asc(questions.sort), asc(questions.createdAt))
    .all()
    .map(toQuestion);
}

export function addQuestion(db: Db, personId: string, input: { text: string }): Question {
  getLivePerson(db, personId);
  const sort = listQuestions(db, personId).reduce((max, q) => Math.max(max, q.sort + 1), 0);
  const row = db.insert(questions).values({ personId, text: input.text, sort }).returning().get();
  touchPerson(db, personId);
  return toQuestion(row);
}

const questionOf = (personId: string, id: string) => and(eq(questions.id, id), open(personId));

export function updateQuestion(db: Db, personId: string, id: string, input: { text: string }) {
  const row = db.update(questions).set(input).where(questionOf(personId, id)).returning().get();
  if (!row) throw notFound();
  touchPerson(db, personId);
  return toQuestion(row);
}

/** Moves a question to the trash (30 days). */
export function deleteQuestion(db: Db, personId: string, id: string) {
  const res = db
    .update(questions)
    .set({ deletedAt: nowIso() })
    .where(questionOf(personId, id))
    .run();
  if (res.changes === 0) throw notFound();
  touchPerson(db, personId);
}

/** Sets the order to `ids`; questions not listed keep their place after them. */
export function reorderQuestions(db: Db, personId: string, ids: string[]): Question[] {
  getLivePerson(db, personId);
  db.transaction((tx) => {
    const own = new Set(
      tx
        .select({ id: questions.id })
        .from(questions)
        .where(and(open(personId), inArray(questions.id, ids.length ? ids : [''])))
        .all()
        .map((r) => r.id),
    );
    ids
      .filter((id) => own.has(id))
      .forEach((id, index) =>
        tx.update(questions).set({ sort: index }).where(eq(questions.id, id)).run(),
      );
  });
  touchPerson(db, personId);
  return listQuestions(db, personId);
}

/**
 * Marks a question as asked. With an answer, a note is added to the person's timeline:
 * the question as its title, the answer as its text.
 */
export function askQuestion(
  db: Db,
  personId: string,
  id: string,
  input: { answer?: string },
): { entry: Entry | null } {
  const row = db
    .update(questions)
    .set({ askedAt: nowIso() })
    .where(questionOf(personId, id))
    .returning()
    .get();
  if (!row) throw notFound();
  touchPerson(db, personId);
  const answer = input.answer?.trim();
  const entry = answer
    ? createEntry(db, { kind: 'note', title: row.text, bodyMd: answer, personIds: [personId] })
    : null;
  return { entry };
}
