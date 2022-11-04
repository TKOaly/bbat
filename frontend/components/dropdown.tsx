import { useRef, useState } from 'react';
import { ChevronDown } from 'react-feather';
import { usePopperTooltip } from 'react-popper-tooltip';
import { useOutsideEventListener } from '../hooks/useOutsideEventListener';

type DropdownProps = {
  label?: string
  scroll?: boolean
  renderTrigger?: (arg: any, arg2: { label: string | null, open: boolean }) => React.ReactNode // eslint-disable-line
  showArrow?: boolean
  options: any[] // eslint-disable-line
  onSelect?: (value: string) => void
}

export const Dropdown = <P extends DropdownProps>({ label = null, scroll = false, renderTrigger = null, showArrow = true, options, onSelect, ...props }: P) => {
  const { visible, getTooltipProps, setTriggerRef, setTooltipRef } = usePopperTooltip({ interactive: true, followCursor: false, placement: 'bottom-end', trigger: 'click', offset: [0, 0] });
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef();

  useOutsideEventListener(dropdownRef, 'click', open, () => open && setOpen(false));

  const customTrigger = renderTrigger?.({
    onClick: (e) => {
      setOpen(!open);
      e.stopPropagation();
    },
    className: 'text-sm text-gray-500 cursor-pointer',
    ref: setTriggerRef,
  }, { label, open });

  return (
    <div {...props} ref={dropdownRef}>
      {customTrigger ?? (
        <button
          ref={setTriggerRef}
          className="text-gray-600 inline-flex hover:bg-gray-50 focus:outline-none font-medium rounded-lg text-sm text-center items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          type="button"
          onClick={(e) => {
            setOpen(!open);
            e.stopPropagation();
          }}
        >
          {(options ?? []).find(o => o.value === props.value && props.value !== undefined)?.text ?? label}
          {showArrow && (
            <ChevronDown
              style={{
                width: '1.25em',
                marginLeft: '0.33em',
                strokeWidth: '2px',
                transform: visible ? 'rotate(180deg)' : 'rotate(0deg)',
                transitionDuration: '200ms',
              }}
            />
          )}
        </button>
      )}
      <div
        ref={setTooltipRef}
        {...getTooltipProps({
          className: `
            z-10
            w-44
            bg-white
            border
            rounded
            divide-y
            divide-gray-100
            shadow
            dark:bg-gray-700
            absolute
            scroll-bar-width-narrow
            ${visible ? 'block' : 'hidden'}
            ${scroll && 'max-h-[20em] overflow-y-auto'}
          `,
        })}
      >
        <ul className="py-1 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefault">
          {(options ?? []).map((option, i) => {
            if (option.divider) {
              return (
                <li className="h-[1px] bg-gray-200 my-1" key={i}></li>
              );
            }

            return (
              <li key={option.value}>
                <button
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onSelect?.(option.value);
                    option.onSelect?.();
                    setOpen(false);
                  }}
                  className="block w-full text-left py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                >
                  {option.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

