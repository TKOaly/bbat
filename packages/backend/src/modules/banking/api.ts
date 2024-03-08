import { Middleware, Parser, router } from 'typera-express';
import { badRequest, ok } from 'typera-express/response';
import { bankAccount, paginationQuery } from '@bbat/common/build/src/types';
import * as bankingService from '@/modules/banking/definitions';
import { parseCamtStatement } from '@bbat/common/build/src/camt-parser';
import { validateBody } from '@/validate-middleware';
import multer from 'multer';
import auth from '@/auth-middleware';
import { RouterFactory } from '@/module';

const factory: RouterFactory = route => {
  const upload = multer({
    storage: multer.memoryStorage(),
  });

  const getBankAccounts = route
    .get('/accounts')
    .use(auth())
    .handler(async ({ bus }) => {
      const accounts = await bus.exec(bankingService.getBankAccounts);
      return ok(accounts);
    });

  const createBankAccount = route
    .post('/accounts')
    .use(auth())
    .use(validateBody(bankAccount))
    .handler(async ({ bus, body }) => {
      const account = await bus.exec(bankingService.createBankAccount, body);
      return ok(account);
    });

  const getBankAccount = route
    .get('/accounts/:iban')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const account = await bus.exec(
        bankingService.getBankAccount,
        ctx.routeParams.iban,
      );
      return ok(account);
    });

  const getBankAccountStatements = route
    .get('/accounts/:iban/statements')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const statements = await bus.exec(
        bankingService.getAccountStatements,
        ctx.routeParams.iban,
      );
      return ok(statements);
    });

  const createBankStatement = route
    .post('/statements')
    .use(auth())
    .use(
      Middleware.wrapNative(upload.single('statement'), ({ req }) => ({
        file: req.file,
      })),
    )
    .handler(async ({ bus, ...ctx }) => {
      if (!ctx.file) {
        return badRequest('File `statement` required.');
      }

      const content = ctx.file.buffer.toString('utf8');
      const statement = await parseCamtStatement(content);

      const result = await bus.exec(bankingService.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      });

      return ok(result.statement);
    });

  const getAccountTransactions = route
    .get('/accounts/:iban/transactions')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query, ...ctx }) => {
      const transactions = await bus.exec(
        bankingService.getAccountTransactions,
        {
          iban: ctx.routeParams.iban,
          cursor: query.cursor,
          sort: query.sort,
          limit: query.limit,
        },
      );

      return ok(transactions);
    });

  const getBankStatement = route
    .get('/statements/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const statement = await bus.exec(
        bankingService.getBankStatement,
        ctx.routeParams.id,
      );

      return ok(statement);
    });

  const getBankStatementTransactions = route
    .get('/statements/:id/transactions')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query: { cursor, limit, sort }, ...ctx }) => {
      const transactions = await bus.exec(
        bankingService.getBankStatementTransactions,
        {
          id: ctx.routeParams.id,
          cursor,
          limit,
          sort,
        },
      );

      return ok(transactions);
    });

  const autoregisterTransactions = route
    .post('/autoregister')
    .use(auth())
    .handler(async () => {
      /*
      const transactions = await bus.exec(
        bankingService.getTransactionsWithoutRegistration,
      );

      for (const transaction of transactions) {
        await bus.exec(paymentService.createPaymentEventFromTransaction, {
          transaction,
          amount: null,
          paymentId: null,
        });
      }*/

      return ok();
    });

  const getTransactionRegistrations = route
    .get('/transactions/:id/registrations')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const events = await bus.exec(
        bankingService.getTransactionRegistrations,
        ctx.routeParams.id,
      );
      return ok(events);
    });

  return router(
    getBankAccounts,
    createBankAccount,
    getBankAccount,
    createBankStatement,
    getAccountTransactions,
    getBankAccountStatements,
    getBankStatement,
    getBankStatementTransactions,
    autoregisterTransactions,
    getTransactionRegistrations,
  );
};

export default factory;
