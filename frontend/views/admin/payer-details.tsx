import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetPayerDebtsQuery, useGetPayerEmailsQuery, useGetPayerQuery, useSendPayerDebtReminderMutation } from '../../api/payers'
import { DebtList } from '../../components/debt-list'
import { Page, Header, Title, Section, TextField, Field, SectionContent, Actions, ActionButton } from '../../components/resource-page/resource-page'
import * as dfns from 'date-fns'
import { useDialog } from '../../components/dialog'
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog'

export const PayerDetails = ({ params }) => {
  const { data: payer } = useGetPayerQuery(params.id)
  const { data: emails } = useGetPayerEmailsQuery(params.id)
  const { data: debts } = useGetPayerDebtsQuery({ id: params.id, includeDrafts: true })
  const [sendPayerDebtReminder] = useSendPayerDebtReminderMutation()
  const showRemindersSentDialog = useDialog(RemindersSentDialog)

  if (!payer || !emails)
    return 'Loading...'

  const overdue = (debts ?? [])
    .filter(d => dfns.isPast(d.dueDate))

  const handleSendReminder = async () => {
    const res = await sendPayerDebtReminder({
      payerId: params.id,
      send: false,
    })

    if ('data' in res) {
      console.log('Showing dialog!!')

      await showRemindersSentDialog({
        payerCount: 1,
        debtCount: res.data.messageDebtCount,
      });
    }
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { url: '/admin/payers', text: 'Payers' },
              payer?.name ?? '',
            ]}
          />
        </Title>
        <Actions>
          {overdue.length == 0 && (
            <ActionButton secondary onClick={handleSendReminder}>Send Reminder</ActionButton>
          )}
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={payer?.name} />
        <Field label="Emails">
          {emails.map((email) => (
            <span title={`Source: ${email.source}`} className={`rounded-[3pt] text-sm py-0.5 px-2 ${{ primary: 'bg-blue-500 text-white', default: 'bg-gray-500 text-black', disabled: 'bg-gray-200 text-gray-500' }[email.priority]}`}>{email.email}</span>
          ))}
        </Field>
      </Section>
      <Section title="Debts">
        <SectionContent>
          <DebtList debts={debts ?? []} />
        </SectionContent>
      </Section>
    </Page>
  )
}
