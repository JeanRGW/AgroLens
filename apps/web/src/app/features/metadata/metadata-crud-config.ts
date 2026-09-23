import { CropTypeRecord, EstadioRecord, PropertyRecord, TalhaoRecord } from '@agrolens/contracts';

export interface MetadataColumnConfig {
  def: string;
  header: string;
}

export interface MetadataCrudConfig<T> {
  entityKey: string;
  singularLabel: string;
  pluralLabel: string;
  eyebrow: string;
  subtitle: string;
  endpoint: string;
  columns: string[];
  columnConfigs?: MetadataColumnConfig[];
  emptyState: {
    icon: string;
    title: string;
    message: string;
  };
}

export const METADATA_CONFIGS = {
  properties: {
    entityKey: 'properties',
    singularLabel: 'propriedade',
    pluralLabel: 'Propriedades',
    eyebrow: 'Cadastros',
    subtitle: 'Gerencie as propriedades rurais vinculadas aos uploads.',
    endpoint: '/properties',
    columns: ['name', 'owner', 'address', 'latitude', 'longitude', 'actions'],
    columnConfigs: [
      { def: 'name', header: 'Nome' },
      { def: 'owner', header: 'Responsável' },
      { def: 'address', header: 'Endereço' },
      { def: 'latitude', header: 'Latitude' },
      { def: 'longitude', header: 'Longitude' },
      { def: 'actions', header: 'Ações' },
    ],
    emptyState: {
      icon: 'landscape',
      title: 'Nenhuma propriedade cadastrada',
      message: 'Use o formulário ao lado para cadastrar a primeira propriedade rural.',
    },
  } as MetadataCrudConfig<PropertyRecord>,

  talhoes: {
    entityKey: 'talhoes',
    singularLabel: 'talhão',
    pluralLabel: 'Talhões',
    eyebrow: 'Cadastros',
    subtitle: 'Gerencie os talhões vinculados às propriedades e uploads.',
    endpoint: '/talhoes',
    columns: ['name', 'property', 'actions'],
    columnConfigs: [
      { def: 'name', header: 'Nome' },
      { def: 'property', header: 'Propriedade' },
      { def: 'actions', header: 'Ações' },
    ],
    emptyState: {
      icon: 'grid_view',
      title: 'Nenhum talhão cadastrado',
      message: 'Cadastre ao menos uma propriedade antes de criar talhões.',
    },
  } as MetadataCrudConfig<TalhaoRecord>,

  crops: {
    entityKey: 'crops',
    singularLabel: 'cultura',
    pluralLabel: 'Culturas',
    eyebrow: 'Cadastros',
    subtitle: 'Gerencie as opções exibidas no cadastro de uploads.',
    endpoint: '/crop-types',
    columns: ['name', 'actions'],
    columnConfigs: [
      { def: 'name', header: 'Nome' },
      { def: 'actions', header: 'Ações' },
    ],
    emptyState: {
      icon: 'grass',
      title: 'Nenhuma cultura cadastrada',
      message: 'Use o formulário ao lado para cadastrar a primeira cultura.',
    },
  } as MetadataCrudConfig<CropTypeRecord>,

  estadios: {
    entityKey: 'estadios',
    singularLabel: 'estádio',
    pluralLabel: 'Estádios Fenológicos',
    eyebrow: 'Cadastros',
    subtitle: 'Gerencie os estádios de desenvolvimento das plantas.',
    endpoint: '/estadios',
    columns: ['name', 'crop', 'actions'],
    columnConfigs: [
      { def: 'name', header: 'Nome' },
      { def: 'crop', header: 'Cultura' },
      { def: 'actions', header: 'Ações' },
    ],
    emptyState: {
      icon: 'eco',
      title: 'Nenhum estádio cadastrado',
      message: 'Cadastre ao menos uma cultura antes de criar estádios.',
    },
  } as MetadataCrudConfig<EstadioRecord>,
} as const;
