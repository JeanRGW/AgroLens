import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatOptionSelectionChange } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { catchError, debounceTime, distinctUntilChanged, from, of, switchMap } from 'rxjs';

import { AutocompleteOption, AutocompleteSearchFn } from '../../models/autocomplete-option';

@Component({
  selector: 'app-autocomplete-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './autocomplete-field.component.html',
  styleUrl: './autocomplete-field.component.scss',
})
export class AutocompleteFieldComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild(MatAutocompleteTrigger)
  private autocompleteTrigger?: MatAutocompleteTrigger;

  @Input({ required: true }) label = '';
  @Input() placeholder = '';
  @Input() prefixIcon?: string;
  @Input() minLength = 2;
  @Input() clearValueOnEmpty = true;
  @Input() autoActiveFirstOption = false;
  @Input() required = false;
  @Input() errorMessage = '';
  @Input() showValueHint = false;
  @Input() valueHintLabel = 'ID';
  @Input() syncExactMatchToValue = true;
  @Input({ required: true }) searchControl!: FormControl<string>;
  @Input({ required: true }) valueControl!: FormControl<string>;
  @Input({ required: true }) searchFn!: AutocompleteSearchFn;
  @Output() optionSelected = new EventEmitter<AutocompleteOption>();
  @Output() exactMatchChange = new EventEmitter<AutocompleteOption | null>();

  readonly options = signal<AutocompleteOption[]>([]);

  private suppressNextTerm: string | null = null;

  ngOnInit(): void {
    if (!this.searchControl || !this.valueControl || !this.searchFn) {
      throw new Error('AutocompleteFieldComponent inputs are not configured.');
    }

    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const normalized = `${term ?? ''}`.trim();
          const normalizedLower = normalized.toLowerCase();

          if (this.suppressNextTerm && normalizedLower === this.suppressNextTerm) {
            this.suppressNextTerm = null;
            return of<AutocompleteOption[]>([]);
          }

          if (this.clearValueOnEmpty && this.valueControl !== this.searchControl) {
            this.valueControl.setValue('', { emitEvent: false });
          }

          if (normalized.length < this.minLength) {
            this.options.set([]);
            return of<AutocompleteOption[]>([]);
          }

          return from(this.searchFn(normalized)).pipe(
            catchError(() => of<AutocompleteOption[]>([])),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((options) => {
        this.options.set(options);

        const normalized = `${this.searchControl.value ?? ''}`.trim().toLowerCase();
        const exactMatch = options.find((option) => {
          return [option.selectionText, option.label, option.value].some(
            (candidate) => `${candidate ?? ''}`.trim().toLowerCase() === normalized,
          );
        });

        if (exactMatch && this.syncExactMatchToValue) {
          this.valueControl.setValue(exactMatch.value, { emitEvent: false });
        }

        this.exactMatchChange.emit(exactMatch ?? null);

        // Ensure the autocomplete panel opens after async results arrive.
        // MatAutocompleteTrigger opens the panel on input events, but the
        // async search results arrive later. We must force change detection
        // so mat-option elements are created, then programmatically open.
        if (options.length > 0) {
          this.cdr.detectChanges();
          this.autocompleteTrigger?.openPanel();
        }
      });
  }

  selectOption(option: AutocompleteOption, event: MatOptionSelectionChange): void {
    if (!event.isUserInput) {
      return;
    }

    const selectionText = this.getOptionText(option);
    this.suppressNextTerm = selectionText.toLowerCase();

    this.searchControl.setValue(selectionText, { emitEvent: false });
    this.valueControl.setValue(option.value, { emitEvent: false });
    this.options.set([]);
    this.markTouched();
    this.optionSelected.emit(option);
  }

  markTouched(): void {
    this.searchControl.markAsTouched();
    if (this.valueControl !== this.searchControl) {
      this.valueControl.markAsTouched();
    }
  }

  get resolvedControl(): FormControl<string> {
    return this.valueControl;
  }

  getOptionText(option: AutocompleteOption): string {
    return `${option.selectionText || option.label || option.value}`.trim();
  }
}
