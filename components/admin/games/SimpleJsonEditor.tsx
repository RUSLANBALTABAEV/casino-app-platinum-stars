'use client';

import React, { useState } from 'react';

type SimpleJsonEditorProps = {
  name: string;
  initialValue: string;
  action: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string>;
  submitLabel?: string;
  isDisabled?: boolean;
};

export function SimpleJsonEditor({
  name,
  initialValue,
  action,
  hiddenFields,
  submitLabel = 'Сохранить',
  isDisabled = false
}: SimpleJsonEditorProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name={name} value={value} />
      {hiddenFields
        ? Object.entries(hiddenFields).map(([key, fieldValue]) => (
            <input key={key} type="hidden" name={key} value={fieldValue} />
          ))
        : null}
      <textarea
        className="min-h-[220px] w-full rounded-2xl border border-blue-400/30 bg-blue-500/20 px-4 py-3 text-xs text-white outline-none transition focus:border-blue-400 focus:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        value={value}
        disabled={isDisabled}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 transition hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={isDisabled}
      >
        {submitLabel}
      </button>
    </form>
  );
}
