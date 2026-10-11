import { Hono } from 'hono';
import {
  createAddressRequestSchema,
  createOrganizationRequestSchema,
  organizationsQuerySchema,
  setFieldValueRequestSchema,
  updateAddressRequestSchema,
  updateOrganizationRequestSchema,
} from '@app/shared';
import { setFieldValue } from '../catalog/fields';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { addAddress, deleteAddress, updateAddress } from '../people/addresses';
import {
  createOrganization,
  deleteOrganization,
  getLiveOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from './service';

export function organizationRoutes({ db }: Deps) {
  const noContent = () => new Response(null, { status: 204 });

  return new Hono<AppEnv>()
    .get('/', validate('query', organizationsQuerySchema), (c) =>
      c.json({ organizations: listOrganizations(db, c.req.valid('query')) }),
    )
    .post('/', validate('json', createOrganizationRequestSchema), (c) =>
      c.json(createOrganization(db, c.req.valid('json')), 201),
    )
    .get('/:id', (c) => c.json(getOrganization(db, c.req.param('id'))))
    .patch('/:id', validate('json', updateOrganizationRequestSchema), (c) =>
      c.json(updateOrganization(db, c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/:id', (c) => {
      deleteOrganization(db, c.req.param('id'));
      return noContent();
    })
    .post('/:id/addresses', validate('json', createAddressRequestSchema), (c) => {
      const organizationId = c.req.param('id');
      getLiveOrganization(db, organizationId);
      return c.json(addAddress(db, { organizationId }, c.req.valid('json')), 201);
    })
    .patch('/:id/addresses/:itemId', validate('json', updateAddressRequestSchema), (c) =>
      c.json(
        updateAddress(
          db,
          { organizationId: c.req.param('id') },
          c.req.param('itemId'),
          c.req.valid('json'),
        ),
      ),
    )
    .delete('/:id/addresses/:itemId', (c) => {
      deleteAddress(db, { organizationId: c.req.param('id') }, c.req.param('itemId'));
      return noContent();
    })
    .put('/:id/fields/:definitionId', validate('json', setFieldValueRequestSchema), (c) => {
      const organizationId = c.req.param('id');
      getLiveOrganization(db, organizationId);
      const result = setFieldValue(
        db,
        'organization',
        organizationId,
        c.req.param('definitionId'),
        c.req.valid('json').value,
      );
      return result ? c.json(result) : noContent();
    });
}
