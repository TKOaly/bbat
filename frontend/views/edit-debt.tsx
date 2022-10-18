import { Formik } from "formik";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PayerIdentity } from "../../common/types";
import * as dfns from 'date-fns'
import { useGetDebtComponentsByCenterQuery, useGetDebtQuery, useUpdateDebtMutation } from "../api/debt";
import { Breadcrumbs } from "../components/breadcrumbs";
import { InputGroup } from "../components/input-group";
import { TextField } from "../components/text-field";
import { DropdownField } from "../components/dropdown-field";
import { TabularFieldListFormik } from "../components/tabular-field-list";
import { EuroField } from "../components/euro-field";
import { useGetDebtCentersQuery } from "../api/debt-centers";
import { useGetUpstreamUsersQuery } from "../api/upstream-users";
import { DateField } from "../components/datetime-field";
import { TextareaField } from "../components/textarea-field";
import { PublishedDebtEditConfirmation } from "../components/dialogs/published-debt-edit-confirmation";
import { useDialog } from "../components/dialog";
import { useLocation } from "wouter";
import { useGetPayersQuery } from "../api/payers";

type DebtFormValues = {
  name: string,
  center: string | { name: string },
  description: string,
  due_date: string,
  components: { component: string | { name: string }, amount: number }[],
  payer: PayerIdentity | null
}

export const EditDebt = ({ params }: { params: { id: string } }) => {
  const { id } = params
  const { data: users } = useGetUpstreamUsersQuery()
  const { data: payers } = useGetPayersQuery()
  const { data: debt } = useGetDebtQuery(id)
  const { data: debtCenters } = useGetDebtCentersQuery()
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(debt?.debtCenterId, { skip: !debt })
  const [updateDebt] = useUpdateDebtMutation()
  const [, setLocation] = useLocation()
  const [editPublished, setEditPublished] = useState(false)
  const showPublishedDebtEditConfirmationDialog = useDialog(PublishedDebtEditConfirmation)

  useEffect(() => {
    if (debt && !debt.draft && !editPublished) {
      showPublishedDebtEditConfirmationDialog({})
        .then((allow) => {
          if (allow) {
            setEditPublished(true);
          } else {
            setLocation(`/admin/debts/${id}`)
          }
        })
    }
  }, [debt])

  const handleSubmit = async (values: DebtFormValues) => {
    if (!values.payer) {
      return;
    }

    if (typeof values.center !== 'string') {
      return;
    }

    const result = await updateDebt({
      id,
      name: values.name,
      description: values.description,
      dueDate: dfns.parse(values.due_date, 'dd.MM.yyyy', new Date()),
      payerId: values.payer,
      centerId: values.center,
    })

    if ('data' in result) {
      setLocation(`/admin/debts/${result.data.id}`)
    }
  }

  const initialValues = useMemo((): DebtFormValues => {
    if (debt) {
      return {
        name: debt.name,
        center: debt.debtCenterId,
        description: debt.description,
        due_date: dfns.format(new Date(debt.dueDate), 'dd.MM.yyyy'),
        payer: debt.payerId,
        components: debt.debtComponents.map(({ id, amount }) => ({ component: id, amount: amount.value * 100 })),
      }
    } else {
      return {
        name: '',
        center: { name: '' },
        description: '',
        due_date: dfns.format(new Date(), 'dd.MM.yyyy'),
        payer: null,
        components: [],
      };
    }
  }, [debt])

  const createCustomPayerOption = useCallback(
    (input) => ({
      type: 'email',
      value: input,
    }),
    []
  )

  const formatCustomPayerOption = useCallback(
    ({ value }) => value,
    []
  )

  const payerOptions = useMemo(() => {
    const options = [];

    if (users) {
      options.push(...users.map(user => ({
        value: { type: 'tkoaly', value: user.id },
        text: user.screenName,
        label: user.username,
      })));
    }

    if (payers) {
      options.push(...payers.map(payer => ({
        value: payer.id,
        text: payer.name
      })));
    }

    return options;
  }, [users])

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            {
              text: 'Debts',
              url: '/admin/debts',
            },
            {
              text: debt?.name ?? id,
              url: `/admin/debts/${id}`,
            },
            'Create Debt',
            'Edit'
          ]}
        />
      </h1>
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validate={(values) => {
          const errors = {} as any;

          if (!/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}$/.test(values.due_date)) {
            errors.due_date = 'Date must be in format <day>.<month>.<year>'
          } else if (!dfns.isMatch(values.due_date, 'dd.MM.yyyy')) {
            errors.due_date = 'Invalid date'
          }

          return errors;
        }}
        onSubmit={handleSubmit}
      >
        {({ values, submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InputGroup label="Name" name="name" component={TextField} />
            <InputGroup
              label="Center"
              name="center"
              allowCustom
              component={DropdownField}
              options={(debtCenters ?? []).map((center) => ({
                text: center.name,
                value: center.id,
              }))}
              createCustomOption={(name) => ({ name })}
              formatCustomOption={({ name }) => name}
            />
            <InputGroup
              label="Payer"
              name="payer"
              allowCustom
              component={DropdownField}
              createCustomOption={createCustomPayerOption}
              formatCustomOption={formatCustomPayerOption}
              options={payerOptions}
            />
            <InputGroup label="Due Date" name="due_date" component={DateField} />
            <InputGroup label="Description" name="description" component={TextareaField} fullWidth />
            <InputGroup
              label="Components"
              name="components"
              fullWidth
              component={TabularFieldListFormik}
              createNew={() => ({
                component: '',
                amount: 0,
              })}
              columns={[
                {
                  header: 'Component',
                  component: DropdownField,
                  key: 'component',
                  props: {
                    options: (centerComponents ?? []).map((component) => ({
                      value: component.id,
                      text: component.name,
                    })),
                    allowCustom: true,
                    formatCustomOption: ({ name }) => name,
                    createCustomOption: (name) => ({ name }),
                  },
                },
                {
                  header: 'Amount',
                  component: EuroField,
                  key: 'amount',
                  props: (row) => {
                    const component = (centerComponents ?? []).find(c => c.id === row.component)

                    return {
                      readOnly: typeof row.component === 'string',
                      value: component ? component.amount.value / 100 : row.amount,
                    };
                  },
                },
              ]}
            />
            <div className="col-span-full flex items-center justify-end gap-3 mt-2">
              <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">Cancel</button>
              <button className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold" onClick={submitForm} disabled={isSubmitting}>Create</button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  );
}
