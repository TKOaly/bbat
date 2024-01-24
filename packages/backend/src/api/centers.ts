import { route, router } from 'typera-express';
import { ok, badRequest, notFound } from 'typera-express/response';
import {
  emailIdentity,
  convertToDbDate,
  Registration,
  createDebtCenterFromEventBody,
} from '@bbat/common/build/src/types';
import * as t from 'io-ts';
import * as E from 'fp-ts/lib/Either';
import * as debtCentersService from '@/services/debt-centers/definitions';
import * as debtService from '@/services/debts/definitions';
import * as eventsService from '@/services/events/definitions';
import * as payerService from '@/services/payers/definitions';
import { validateBody } from '../validate-middleware';
import { pipe } from 'fp-ts/lib/function';
import { euroValue } from '@bbat/common/build/src/currency';
import { ApiDeps } from '.';

const componentRule = t.type({
  type: t.literal('CUSTOM_FIELD'),
  eventId: t.number,
  customFieldId: t.number,
  value: t.string,
});

type ComponentRule = t.TypeOf<typeof componentRule>;

export default ({ bus, auth, config }: ApiDeps) => {
  const getDebtCenters = route
    .get('/')
    .use(auth.createAuthMiddleware())
    .handler(async () => {
      const centers = await bus.exec(debtCentersService.getDebtCenters);
      return ok(centers);
    });

  const getDebtCenter = route
    .get('/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const center = await bus.exec(
        debtCentersService.getDebtCenter,
        ctx.routeParams.id,
      );

      if (center) {
        return ok(center);
      } else {
        return notFound();
      }
    });

  const getDebtsByCenter = route
    .get('/:id/debts')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const debts = await bus.exec(
        debtService.getDebtsByCenter,
        ctx.routeParams.id,
      );
      return ok(debts);
    });

  const getDebtComponentsByCenter = route
    .get('/:id/components')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const components = await bus.exec(
        debtService.getDebtComponentsByCenter,
        ctx.routeParams.id,
      );
      return ok(components);
    });

  const createDebtCenter = route
    .post('/')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      try {
        const center = await bus.exec(
          debtCentersService.createDebtCenter,
          ctx.req.body,
        );
        return ok(center);
      } catch (err) {
        console.log(err);

        if ((err as any).constraint === 'name_unique') {
          return badRequest({
            type: 'unique_violation',
            field: 'name',
            message: `Debt center with name "${ctx.req.body.name}" already exists`,
            data: {
              value: ctx.req.body.name,
            },
          });
        }

        throw err;
      }
    });

  const deleteDebtCenter = route
    .delete('/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const debts = await bus.exec(
        debtService.getDebtsByCenter,
        ctx.routeParams.id,
      );

      if (debts.length > 0) {
        return badRequest({
          error: 'contains_debts',
        });
      }

      const deleted = await bus.exec(
        debtCentersService.deleteDebtCenter,
        ctx.routeParams.id,
      );

      if (deleted === null) {
        return notFound({
          error: 'not_found',
        });
      }

      return ok();
    });

  const updateDebtCenter = route
    .put('/:id')
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          name: t.string,
          description: t.string,
          url: t.string,
        }),
      ),
    )
    .handler(async ctx => {
      await bus.exec(debtCentersService.updateDebtCenter, {
        id: ctx.routeParams.id,
        ...ctx.body,
      });

      const updated = await bus.exec(
        debtCentersService.getDebtCenter,
        ctx.routeParams.id,
      );

      return ok(updated);
    });

  async function evaluateRule(
    rule: ComponentRule,
    eventId: number,
    registration: Registration,
  ): Promise<boolean> {
    if (rule.type === 'CUSTOM_FIELD') {
      if (rule.eventId !== eventId) {
        return false;
      }

      const answer = registration.answers.find(
        answer => answer.questionId === rule.customFieldId,
      );

      if (!answer) {
        return false;
      }

      return answer.answer === rule.value;
    }

    return false;
  }

  const createDebtCenterFromEvent = route
    .post('/fromEvent')
    .use(auth.createAuthMiddleware())
    .use(validateBody(createDebtCenterFromEventBody))
    .handler(async ctx => {
      const body = ctx.body;

      const registrations = await Promise.all(
        body.events.map(id => {
          return bus.exec(eventsService.getEventRegistrations, id);
        }),
      );

      const registrationsFlat = registrations.flat();

      for (const id of body.registrations) {
        const index = registrationsFlat.findIndex(r => r.id === id);

        if (index === -1) {
          return badRequest({
            message: `Registration ${id} does not belong to any of the specified events`,
          });
        }
      }

      const center = await bus.exec(debtCentersService.createDebtCenter, {
        name: body.settings.name,
        description: body.settings.description,
        accountingPeriod: body.settings.accountingPeriod,
        url: '',
      });

      if (!center) {
        throw new Error('Unable to create new debt center');
      }

      let baseComponentId: string | null = null;

      if (body.settings.basePrice) {
        const baseComponent = await bus.exec(debtService.createDebtComponent, {
          name: 'Base price',
          amount: body.settings.basePrice,
          description: 'Base price for the event',
          debtCenterId: center.id,
        });

        baseComponentId = baseComponent.id;
      }

      const components = await Promise.all(
        body.settings.components.map(mapping => {
          return bus.exec(debtService.createDebtComponent, {
            name: mapping.name,
            amount: mapping.amount,
            description: 'Autogenerated from event registration fields',
            debtCenterId: center.id,
          });
        }),
      );

      await Promise.all(
        registrations.flatMap((registrations, i) =>
          registrations
            .filter(reg => body.registrations.indexOf(reg.id) > -1)
            .map(async registration => {
              const eventId = body.events[i];

              const componentIdPromises = body.settings.components.map(
                async (mapping, i) => {
                  for (const rule of mapping.rules) {
                    const result = await evaluateRule(
                      rule,
                      eventId,
                      registration,
                    );

                    if (result) {
                      return [components[i].id];
                    }
                  }

                  return [];
                },
              );

              const componentIds = (
                await Promise.all(componentIdPromises)
              ).flat();

              const payerIdentity = registration.userId
                ? registration.userId
                : emailIdentity(registration.email);

              const payer = await bus.exec(
                payerService.createPayerProfileForExternalIdentity,
                {
                  id: payerIdentity,
                  token: ctx.req.cookies.token,
                  name: registration.name,
                },
              );

              if (!payer) {
                throw new Error('Unable to create payer profile for the debt');
              }

              const dueDate = convertToDbDate(body.settings.dueDate);

              if (!dueDate) {
                throw new Error('Date conversion error');
              }

              const debt = await bus.exec(debtService.createDebt, {
                debt: {
                  name: body.settings.name,
                  description: body.settings.description,
                  centerId: center.id,
                  accountingPeriod: body.settings.accountingPeriod,
                  components: baseComponentId
                    ? [baseComponentId, ...componentIds]
                    : componentIds,
                  payer: payer.id,
                  dueDate,
                  paymentCondition: null,
                  tags: [{ name: 'from-event', hidden: true }],
                },
              });

              return debt;
            }),
        ),
      );

      return ok(center);
    });

  const deleteDebtComponent = route
    .delete('/:debtCenterId/components/:debtComponentId')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const { debtCenterId, debtComponentId } = ctx.routeParams;

      return pipe(
        await bus.exec(debtService.deleteDebtComponent, {
          debtCenterId,
          debtComponentId,
        }),
        E.matchW(
          () => notFound(),
          ({ affectedDebts }) => ok({ affectedDebts }),
        ),
      );
    });

  const updateDebtComponent = route
    .patch('/:debtCenterId/components/:debtComponentId')
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.partial({
          name: t.string,
          amount: euroValue,
        }),
      ),
    )
    .handler(async ctx => {
      const { debtCenterId, debtComponentId } = ctx.routeParams;

      const component = await bus.exec(debtService.updateDebtComponent, {
        debtCenterId,
        debtComponentId,
        debtComponent: ctx.body,
      });

      if (!component) {
        return notFound();
      } else {
        return ok(component);
      }
    });

  return router(
    createDebtCenter,
    getDebtsByCenter,
    getDebtCenters,
    getDebtCenter,
    getDebtComponentsByCenter,
    createDebtCenterFromEvent,
    updateDebtCenter,
    deleteDebtComponent,
    deleteDebtCenter,
    updateDebtComponent,
  );
};
