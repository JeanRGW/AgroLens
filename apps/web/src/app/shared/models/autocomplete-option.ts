export interface AutocompleteOption {
  value: string;
  label: string;
  secondary?: string;
  selectionText?: string;
}

export type AutocompleteSearchFn = (term: string) => Promise<AutocompleteOption[]>;
