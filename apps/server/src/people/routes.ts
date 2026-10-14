import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  addPersonTagRequestSchema,
  createFactRequestSchema,
  createReminderRequestSchema,
  reorderFactsRequestSchema,
  updateFactRequestSchema,
  createAddressRequestSchema,
  createAffiliationRequestSchema,
  createContactPointRequestSchema,
  createPersonRequestSchema,
  createRelationshipRequestSchema,
  peopleQuerySchema,
  setFieldValueRequestSchema,
  updateAddressRequestSchema,
  updateAffiliationRequestSchema,
  updateContactPointRequestSchema,
  updatePersonRequestSchema,
  updateRelationshipRequestSchema,
  askQuestionRequestSchema,
  createQuestionRequestSchema,
  reorderQuestionsRequestSchema,
  updateQuestionRequestSchema,
  createPersonDateRequestSchema,
  updatePersonDateRequestSchema,
} from '@app/shared';
import { setFieldValue } from '../catalog/fields';
import { addFact, deleteFact, reorderFacts, updateFact } from '../facts/service';
import {
  addQuestion,
  askQuestion,
  deleteQuestion,
  reorderQuestions,
  updateQuestion,
} from '../questions/service';
import { addReminder } from '../reminders/service';
import { addPersonDate, deletePersonDate, updatePersonDate } from '../person-dates/service';
import { recordView } from '../today/service';
import type { AppEnv, Deps } from '../env';
import { MAX_UPLOAD_BYTES, removeFile, storePhoto } from '../files/service';
import { DomainError } from '../lib/errors';
import { validate } from '../lib/validate';
import { addAddress, deleteAddress, updateAddress } from './addresses';
import { getLivePerson, touchPerson } from './refs';
import {
  addAffiliation,
  addContactPoint,
  addPersonTag,
  addRelationship,
  createPerson,
  deleteAffiliation,
  deleteContactPoint,
  deletePerson,
  deleteRelationship,
  getPerson,
  listPeople,
  removePersonTag,
  setPhoto,
  updateAffiliation,
  updateContactPoint,
  updatePerson,
  updateRelationship,
} from './service';

export function peopleRoutes({ db, config }: Deps) {
  const noContent = () => new Response(null, { status: 204 });

  return (
    new Hono<AppEnv>()
      .get('/', validate('query', peopleQuerySchema), (c) =>
        c.json({ people: listPeople(db, c.req.valid('query')) }),
      )
      .post('/', validate('json', createPersonRequestSchema), (c) =>
        c.json(createPerson(db, c.req.valid('json')), 201),
      )
      .get('/:id', (c) => c.json(getPerson(db, c.req.param('id'))))
      .patch('/:id', validate('json', updatePersonRequestSchema), (c) =>
        c.json(updatePerson(db, c.req.param('id'), c.req.valid('json'))),
      )
      .delete('/:id', (c) => {
        deletePerson(db, c.req.param('id'));
        return noContent();
      })
      // The web app calls this when a person page is opened (“Recently viewed”).
      .post('/:id/viewed', (c) => {
        recordView(db, c.req.param('id'));
        return noContent();
      })

      // Photo
      .put(
        '/:id/photo',
        bodyLimit({
          maxSize: MAX_UPLOAD_BYTES,
          onError: (c) => c.json({ error: 'file_too_large' }, 413),
        }),
        async (c) => {
          const id = c.req.param('id');
          getLivePerson(db, id);
          const body = await c.req.parseBody();
          const file = body.file;
          if (!(file instanceof File)) throw new DomainError(400, 'file_required');
          const stored = await storePhoto(
            db,
            config.dataDir,
            Buffer.from(await file.arrayBuffer()),
          );
          const previous = setPhoto(db, id, stored.id);
          if (previous.photoFileId) await removeFile(db, config.dataDir, previous.photoFileId);
          return c.json(getPerson(db, id));
        },
      )
      .delete('/:id/photo', async (c) => {
        const id = c.req.param('id');
        const previous = setPhoto(db, id, null);
        if (previous.photoFileId) await removeFile(db, config.dataDir, previous.photoFileId);
        return c.json(getPerson(db, id));
      })

      // Contact points
      .post('/:id/contact-points', validate('json', createContactPointRequestSchema), (c) =>
        c.json(addContactPoint(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .patch(
        '/:id/contact-points/:itemId',
        validate('json', updateContactPointRequestSchema),
        (c) =>
          c.json(
            updateContactPoint(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json')),
          ),
      )
      .delete('/:id/contact-points/:itemId', (c) => {
        deleteContactPoint(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })

      // Addresses
      .post('/:id/addresses', validate('json', createAddressRequestSchema), (c) => {
        const personId = c.req.param('id');
        getLivePerson(db, personId);
        const address = addAddress(db, { personId }, c.req.valid('json'));
        touchPerson(db, personId);
        return c.json(address, 201);
      })
      .patch('/:id/addresses/:itemId', validate('json', updateAddressRequestSchema), (c) => {
        const personId = c.req.param('id');
        const address = updateAddress(db, { personId }, c.req.param('itemId'), c.req.valid('json'));
        touchPerson(db, personId);
        return c.json(address);
      })
      .delete('/:id/addresses/:itemId', (c) => {
        const personId = c.req.param('id');
        deleteAddress(db, { personId }, c.req.param('itemId'));
        touchPerson(db, personId);
        return noContent();
      })

      // Affiliations
      .post('/:id/affiliations', validate('json', createAffiliationRequestSchema), (c) =>
        c.json(addAffiliation(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .patch('/:id/affiliations/:itemId', validate('json', updateAffiliationRequestSchema), (c) =>
        c.json(
          updateAffiliation(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json')),
        ),
      )
      .delete('/:id/affiliations/:itemId', (c) => {
        deleteAffiliation(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })

      // Relationships
      .post('/:id/relationships', validate('json', createRelationshipRequestSchema), (c) =>
        c.json(addRelationship(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .patch('/:id/relationships/:itemId', validate('json', updateRelationshipRequestSchema), (c) =>
        c.json(
          updateRelationship(
            db,
            c.req.param('id'),
            c.req.param('itemId'),
            c.req.valid('json').note,
          ),
        ),
      )
      .delete('/:id/relationships/:itemId', (c) => {
        deleteRelationship(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })

      // Tags
      .post('/:id/tags', validate('json', addPersonTagRequestSchema), (c) =>
        c.json(addPersonTag(db, c.req.param('id'), c.req.valid('json').name), 201),
      )
      .delete('/:id/tags/:tagId', (c) => {
        removePersonTag(db, c.req.param('id'), c.req.param('tagId'));
        return noContent();
      })

      // Recurring days
      .post('/:id/dates', validate('json', createPersonDateRequestSchema), (c) =>
        c.json(addPersonDate(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .patch('/:id/dates/:itemId', validate('json', updatePersonDateRequestSchema), (c) =>
        c.json(updatePersonDate(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json'))),
      )
      .delete('/:id/dates/:itemId', (c) => {
        deletePersonDate(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })

      // Questions for next time
      .post('/:id/questions', validate('json', createQuestionRequestSchema), (c) =>
        c.json(addQuestion(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .put('/:id/questions/order', validate('json', reorderQuestionsRequestSchema), (c) =>
        c.json({ questions: reorderQuestions(db, c.req.param('id'), c.req.valid('json').ids) }),
      )
      .patch('/:id/questions/:itemId', validate('json', updateQuestionRequestSchema), (c) =>
        c.json(updateQuestion(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json'))),
      )
      .delete('/:id/questions/:itemId', (c) => {
        deleteQuestion(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })
      .post('/:id/questions/:itemId/asked', validate('json', askQuestionRequestSchema), (c) =>
        c.json(askQuestion(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json'))),
      )

      // Facts
      .post('/:id/facts', validate('json', createFactRequestSchema), (c) =>
        c.json(addFact(db, c.req.param('id'), c.req.valid('json')), 201),
      )
      .put('/:id/facts/order', validate('json', reorderFactsRequestSchema), (c) =>
        c.json({ facts: reorderFacts(db, c.req.param('id'), c.req.valid('json').ids) }),
      )
      .patch('/:id/facts/:itemId', validate('json', updateFactRequestSchema), (c) =>
        c.json(updateFact(db, c.req.param('id'), c.req.param('itemId'), c.req.valid('json'))),
      )
      .delete('/:id/facts/:itemId', (c) => {
        deleteFact(db, c.req.param('id'), c.req.param('itemId'));
        return noContent();
      })

      // Follow-ups
      .post('/:id/reminders', validate('json', createReminderRequestSchema), (c) =>
        c.json(addReminder(db, c.req.param('id'), c.req.valid('json')), 201),
      )

      // Custom fields
      .put('/:id/fields/:definitionId', validate('json', setFieldValueRequestSchema), (c) => {
        const personId = c.req.param('id');
        getLivePerson(db, personId);
        const result = setFieldValue(
          db,
          'person',
          personId,
          c.req.param('definitionId'),
          c.req.valid('json').value,
        );
        touchPerson(db, personId);
        return result ? c.json(result) : noContent();
      })
  );
}
