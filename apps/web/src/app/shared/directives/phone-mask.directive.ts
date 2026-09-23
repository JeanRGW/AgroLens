import { Directive, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { formatPhone } from '../utils/record-utils';

@Directive({
  selector: '[phoneMask]',
  host: { '(input)': 'onInput($event)' },
})
export class PhoneMaskDirective {
  private readonly ngControl = inject(NgControl, { optional: true });

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const start = input.selectionStart ?? input.value.length;
    const prevLength = input.value.length;
    const formatted = formatPhone(input.value);

    input.value = formatted;

    const diff = formatted.length - prevLength;
    const newPos = Math.max(0, start + diff);
    input.setSelectionRange(newPos, newPos);

    this.ngControl?.control?.setValue(formatted, { emitEvent: false });
  }
}
