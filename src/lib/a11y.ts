export interface FieldErrorAttributes {
  'aria-invalid': true;
  'aria-describedby': string;
}

export function fieldErrorAttributes(errorId: string): FieldErrorAttributes {
  return {
    'aria-invalid': true,
    'aria-describedby': errorId,
  };
}

export function focusFirstInvalidField(root?: ParentNode): boolean {
  const target = root ?? (typeof document === 'undefined' ? undefined : document);
  if (!target) return false;

  const invalidField = target.querySelector<HTMLElement>(
    '[aria-invalid="true"], [data-invalid="true"]',
  );
  if (!invalidField) return false;
  invalidField.focus();
  return true;
}
