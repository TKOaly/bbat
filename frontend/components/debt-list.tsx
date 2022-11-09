import { TableView } from './table-view';
import { Debt, DebtWithPayer, PayerProfile } from '../../common/types';
import { Link, useLocation } from 'wouter';
import { useDeleteDebtMutation, usePublishDebtsMutation } from '../api/debt';
import { ExternalLink } from 'react-feather';
import { MassEditDebtsDialog } from './dialogs/mass-edit-debts-dialog';
import { useDialog } from './dialog';
import { sortBy } from 'remeda';

export type Props = {
  debts: (DebtWithPayer | Debt)[]
  payer?: PayerProfile
}

export const DebtList = (props: Props) => {
  const [publishDebts] = usePublishDebtsMutation();
  const [deleteDebt] = useDeleteDebtMutation();
  const [, setLocation] = useLocation();
  const showMassEditDebtsDialog = useDialog(MassEditDebtsDialog);

  const rows: (DebtWithPayer & { key: string })[] = (props.debts ?? [])
    .map((d) => props.payer ? ({ ...d, payer: props.payer, key: d.id }) : ({ ...d, key: d.id })) as any; // eslint-disable-line

  return (
    <TableView
      onRowClick={(row) => setLocation(`/admin/debts/${row.id}`)}
      selectable
      rows={rows}
      columns={[
        { name: 'Name', getValue: 'name' },
        {
          name: 'Payer',
          getValue: (row) => row.payer.name,
          render: (_value, row) => (
            <Link onClick={(e) => e.stopPropagation()} to={`/admin/payers/${row.payer.id.value}`} className="flex gap-1 items-center">{row.payer.name} <ExternalLink className="text-blue-500 h-4" /></Link>
          ),
        },
        {
          name: 'Status',
          getValue: (row) => {
            const badges = [];

            if (row.credited) {
              badges.push('Credited');
            }

            if (row.draft) {
              badges.push('Draft');
            }

            if (row.status === 'paid') {
              badges.push('Paid');
            }

            if (row.status === 'unpaid') {
              badges.push('Unpaid');
            }

            if (row.status === 'mispaid') {
              badges.push('Mispaid');
            }

            return badges;
          },
          render: (value) => value.map((value) => {
            return {
              'Draft': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-500 text-xs font-bold text-white mr-1">Draft</span>,
              'Unpaid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600 mr-1">Unpaid</span>,
              'Mispaid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-red-500 text-xs font-bold text-white mr-1">Mispaid</span>,
              'Paid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white mr-1">Paid</span>,
              'Credited': <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-1">Credited</span>,
            }[value];
          }),
        },
        {
          name: 'Components',
          getValue: (debt) => sortBy(debt.debtComponents, (dc) => dc.name),
          compareBy: (value) => value.id,
          render: (value) => value.map(({ name, id }) => (
            <span className="py-0.5 whitespace-nowrap px-1.5 mr-1 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600" key={id}>{name}</span>
          )),
        },
      ]}
      actions={[
        {
          key: 'delete',
          text: 'Delete',
          disabled: (row) => !row.draft,
          onSelect: async (rows) => {
            await Promise.all(rows.map(({ id }) => deleteDebt(id)));
          },
        },
        {
          key: 'publish',
          text: 'Publish',
          onSelect: async (rows) => {
            await publishDebts(rows.map(r => r.id));
          },
        },
        {
          key: 'edit',
          text: 'Edit',
          onSelect: async (debts) => {
            if (debts.length === 1) {
              setLocation(`/admin/debts/${debts[0].id}/edit`);
              return;
            }

            await showMassEditDebtsDialog({
              debts,
            });
          },
        },
      ]}
    />
  );
};
