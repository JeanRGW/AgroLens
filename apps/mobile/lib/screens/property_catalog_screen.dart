import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../models/catalog.dart';
import '../services/catalog_repository.dart';
import '../utils/catalog_validation.dart';
import '../widgets/catalog_widgets.dart';
import 'location_picker_screen.dart';
import '../utils/location_defaults.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_text_field.dart';

class PropertyCatalogScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;

  const PropertyCatalogScreen({super.key, required this.catalogRepository});

  @override
  State<PropertyCatalogScreen> createState() => _PropertyCatalogScreenState();
}

class _PropertyCatalogScreenState extends State<PropertyCatalogScreen> {
  final _searchController = TextEditingController();
  List<Property> _properties = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProperties();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProperties({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final properties = await widget.catalogRepository.getProperties(
        forceRefresh: forceRefresh,
      );
      if (mounted) setState(() => _properties = properties);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível carregar as propriedades. Verifique a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Property> get _filteredProperties {
    final query = _searchController.text;
    return _properties.where((property) {
      return matchesSearchQuery(property.name, query) ||
          matchesSearchQuery(property.owner, query) ||
          matchesSearchQuery(property.address, query);
    }).toList();
  }

  Future<void> _openCreateForm() async {
    final created = await Navigator.of(context).push<Property>(
      MaterialPageRoute(
        builder: (_) =>
            PropertyFormScreen(catalogRepository: widget.catalogRepository),
      ),
    );
    if (!mounted || created == null) return;
    await _loadProperties();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            created.isPendingSync
                ? 'Propriedade salva localmente e será sincronizada quando houver conexão.'
                : 'Propriedade criada com sucesso.',
          ),
        ),
      );
    }
  }

  Future<void> _openEditForm(Property property) async {
    final updated = await Navigator.of(context).push<Property>(
      MaterialPageRoute(
        builder: (_) => PropertyFormScreen(
          catalogRepository: widget.catalogRepository,
          initialProperty: property,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    await _loadProperties();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Propriedade atualizada com sucesso')),
      );
    }
  }

  Future<void> _deleteProperty(Property property) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await confirmDestructiveAction(
      context,
      title: 'Excluir propriedade?',
      message:
          'Excluir "${property.name}" também remove os vínculos de talhões e uploads associados.',
    );
    if (!confirmed) return;

    try {
      await widget.catalogRepository.deleteProperty(propertyId: property.id);
      if (!mounted) return;
      await _loadProperties();
      messenger.showSnackBar(
        const SnackBar(content: Text('Propriedade excluída')),
      );
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Não foi possível excluir a propriedade. Tente novamente.',
          ),
        ),
      );
    }
  }

  void _showPendingSyncBlockedMessage() =>
      showPendingSyncBlockedMessage(context);

  Future<void> _openDetails(Property property) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PropertyDetailScreen(
          catalogRepository: widget.catalogRepository,
          property: property,
        ),
      ),
    );
    if (mounted) {
      await _loadProperties(forceRefresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredProperties;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Propriedades',
        actions: [
          CustomAppBarAction(
            child: IconButton(
              onPressed: () => _loadProperties(forceRefresh: true),
              icon: const Icon(Icons.refresh, color: Colors.white),
              tooltip: 'Atualizar',
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreateForm,
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadProperties(forceRefresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            CatalogSearchField(
              controller: _searchController,
              hintText: 'Buscar por nome, proprietário ou endereço',
              onChanged: () => setState(() {}),
            ),
            const SizedBox(height: 16),
            if (!_loading && _error == null)
              CatalogCountBanner(
                icon: Icons.home_work_outlined,
                singleLine: true,
                text: _searchController.text.isNotEmpty
                    ? '${filtered.length} ${filtered.length == 1 ? 'resultado' : 'resultados'} de ${_properties.length} ${_properties.length == 1 ? 'propriedade' : 'propriedades'}.'
                    : '${filtered.length} ${filtered.length == 1 ? 'propriedade cadastrada' : 'propriedades cadastradas'}.',
              ),
            ...catalogListChildren(
              loading: _loading,
              error: _error,
              errorTitle: 'Erro ao carregar propriedades',
              onRetry: () => _loadProperties(forceRefresh: true),
              listIsEmpty: filtered.isEmpty,
              emptyIcon: Icons.inventory_2_outlined,
              emptyTitle: _properties.isEmpty
                  ? 'Nenhuma propriedade cadastrada'
                  : 'Nenhum resultado para a busca',
              emptyMessage: _properties.isEmpty
                  ? 'Cadastre a primeira propriedade para começar.'
                  : 'Ajuste o filtro de pesquisa.',
              emptyActionLabel: _properties.isEmpty ? 'Nova propriedade' : null,
              emptyAction: _properties.isEmpty ? _openCreateForm : null,
              items: () =>
                  filtered.map((property) => _propertyCard(property)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _propertyCard(Property property) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CatalogIconBox(icon: Icons.home_work_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  property.name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          CatalogSummaryRow(icon: Icons.person_outline, value: property.owner),
          CatalogSummaryRow(
            icon: Icons.location_on_outlined,
            value: property.address,
          ),
          CatalogSummaryRow(
            icon: Icons.gps_fixed,
            value:
                '${property.latitude.toStringAsFixed(6)}, ${property.longitude.toStringAsFixed(6)}',
          ),
          if (property.isPendingSync) const Text('Pendente de sincronização'),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: [
                Expanded(
                  child: CompactCatalogButton(
                    onPressed: () => _openDetails(property),
                    icon: Icons.grid_view,
                    label: 'Talhões',
                  ),
                ),
                if (widget.catalogRepository.canMutate(property)) ...[
                  const SizedBox(width: 6),
                  Expanded(
                    child: CompactCatalogButton(
                      onPressed: property.isPendingSync
                          ? _showPendingSyncBlockedMessage
                          : () => _openEditForm(property),
                      icon: Icons.edit_outlined,
                      label: 'Editar',
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: CompactCatalogButton(
                      onPressed: property.isPendingSync
                          ? _showPendingSyncBlockedMessage
                          : () => _deleteProperty(property),
                      icon: Icons.delete_outline,
                      label: 'Excluir',
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class PropertyDetailScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final Property property;

  const PropertyDetailScreen({
    super.key,
    required this.catalogRepository,
    required this.property,
  });

  @override
  State<PropertyDetailScreen> createState() => _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends State<PropertyDetailScreen> {
  late Property _property;
  final _searchController = TextEditingController();
  List<Talhao> _talhoes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _property = widget.property;
    _loadTalhoes();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadTalhoes({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final talhoes = await widget.catalogRepository.getTalhoes(
        forceRefresh: forceRefresh,
      );
      if (mounted) {
        setState(() {
          _talhoes = talhoes
              .where((talhao) => talhao.propertyId == _property.id)
              .toList();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível carregar os talhões. Verifique a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Talhao> get _filteredTalhoes {
    final query = _searchController.text;
    return _talhoes
        .where((talhao) => matchesSearchQuery(talhao.name, query))
        .toList();
  }

  void _showPendingSyncBlockedMessage() =>
      showPendingSyncBlockedMessage(context);

  Future<void> _editProperty() async {
    final updated = await Navigator.of(context).push<Property>(
      MaterialPageRoute(
        builder: (_) => PropertyFormScreen(
          catalogRepository: widget.catalogRepository,
          initialProperty: _property,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    setState(() => _property = updated);
    await _loadTalhoes();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Propriedade atualizada com sucesso')),
      );
    }
  }

  Future<void> _createTalhao() async {
    final created = await Navigator.of(context).push<Talhao>(
      MaterialPageRoute(
        builder: (_) => TalhaoFormScreen(
          catalogRepository: widget.catalogRepository,
          property: _property,
        ),
      ),
    );
    if (!mounted || created == null) return;
    await _loadTalhoes();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            created.isPendingSync
                ? 'Talhão salvo localmente e será sincronizado quando houver conexão.'
                : 'Talhão criado com sucesso.',
          ),
        ),
      );
    }
  }

  Future<void> _editTalhao(Talhao talhao) async {
    final updated = await Navigator.of(context).push<Talhao>(
      MaterialPageRoute(
        builder: (_) => TalhaoFormScreen(
          catalogRepository: widget.catalogRepository,
          property: _property,
          initialTalhao: talhao,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    await _loadTalhoes();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Talhão atualizado com sucesso')),
      );
    }
  }

  Future<void> _deleteTalhao(Talhao talhao) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await confirmDestructiveAction(
      context,
      title: 'Excluir talhão?',
      message:
          'Excluir "${talhao.name}" também remove os vínculos de uploads associados.',
    );
    if (!confirmed) return;

    try {
      await widget.catalogRepository.deleteTalhao(talhaoId: talhao.id);
      if (!mounted) return;
      await _loadTalhoes();
      messenger.showSnackBar(const SnackBar(content: Text('Talhão excluído')));
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Não foi possível excluir o talhão. Tente novamente.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final talhoes = _filteredTalhoes;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: _property.name,
        subtitle: 'Talhões da propriedade',
        actions: [
          if (widget.catalogRepository.canMutate(_property))
            CustomAppBarAction(
              child: IconButton(
                onPressed: _property.isPendingSync ? null : _editProperty,
                icon: const Icon(Icons.edit, color: Colors.white),
                tooltip: 'Editar propriedade',
              ),
            ),
        ],
      ),
      floatingActionButton: widget.catalogRepository.canMutate(_property)
          ? FloatingActionButton(
              onPressed: _createTalhao,
              tooltip: 'Novo talhão',
              child: const Icon(Icons.add),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => _loadTalhoes(forceRefresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Propriedade',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    CatalogDetailRow(label: 'Nome', value: _property.name),
                    CatalogDetailRow(
                      label: 'Proprietário',
                      value: _property.owner,
                    ),
                    CatalogDetailRow(
                      label: 'Endereço',
                      value: _property.address,
                    ),
                    CatalogDetailRow(
                      label: 'Latitude',
                      value: _property.latitude.toStringAsFixed(6),
                    ),
                    CatalogDetailRow(
                      label: 'Longitude',
                      value: _property.longitude.toStringAsFixed(6),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            CatalogSearchField(
              controller: _searchController,
              hintText: 'Buscar talhões',
              onChanged: () => setState(() {}),
            ),
            const SizedBox(height: 16),
            if (!_loading && _error == null)
              CatalogCountBanner(
                icon: Icons.grid_view,
                iconSpacing: 8,
                text: _searchController.text.isNotEmpty
                    ? '${talhoes.length} ${talhoes.length == 1 ? 'resultado' : 'resultados'} de ${_talhoes.length} ${talhoes.length == 1 ? 'talhão' : 'talhões'}'
                    : '${talhoes.length} ${talhoes.length == 1 ? 'talhão cadastrado' : 'talhões cadastrados'}',
              ),
            ...catalogListChildren(
              loading: _loading,
              error: _error,
              errorTitle: 'Erro ao carregar talhões',
              onRetry: () => _loadTalhoes(forceRefresh: true),
              listIsEmpty: talhoes.isEmpty,
              emptyIcon: Icons.view_column_outlined,
              emptyTitle: _talhoes.isEmpty
                  ? 'Nenhum talhão cadastrado'
                  : 'Nenhum resultado para a busca',
              emptyMessage: _talhoes.isEmpty
                  ? 'Adicione o primeiro talhão desta propriedade.'
                  : 'Ajuste o filtro de pesquisa.',
              emptyActionLabel: _talhoes.isEmpty ? 'Novo talhão' : null,
              emptyAction: _talhoes.isEmpty ? _createTalhao : null,
              items: () =>
                  talhoes.map((talhao) => _talhaoCard(talhao)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _talhaoCard(Talhao talhao) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CatalogIconBox(icon: Icons.crop_square_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  talhao.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(
                      Icons.home_work_outlined,
                      size: 18,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _property.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ),
                  ],
                ),
                if (talhao.isPendingSync)
                  Text(
                    'Pendente de sincronização',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                if (widget.catalogRepository.canMutate(talhao)) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: CompactCatalogButton(
                          onPressed: talhao.isPendingSync
                              ? _showPendingSyncBlockedMessage
                              : () => _editTalhao(talhao),
                          icon: Icons.edit_outlined,
                          label: 'Editar',
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: CompactCatalogButton(
                          onPressed: talhao.isPendingSync
                              ? _showPendingSyncBlockedMessage
                              : () => _deleteTalhao(talhao),
                          icon: Icons.delete_outline,
                          label: 'Excluir',
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class PropertyFormScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final Property? initialProperty;

  const PropertyFormScreen({
    super.key,
    required this.catalogRepository,
    this.initialProperty,
  });

  @override
  State<PropertyFormScreen> createState() => _PropertyFormScreenState();
}

class _PropertyFormScreenState extends State<PropertyFormScreen>
    with CatalogFormSaveMixin<PropertyFormScreen> {
  String? _newOwnerId;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _ownerController;
  late final TextEditingController _addressController;
  late final TextEditingController _latitudeController;
  late final TextEditingController _longitudeController;

  LatLng? _currentCoordinateInput() {
    return parseCoordinatePair(
      _latitudeController.text,
      _longitudeController.text,
    );
  }

  @override
  void initState() {
    super.initState();
    final property = widget.initialProperty;
    _nameController = TextEditingController(text: property?.name ?? '');
    _ownerController = TextEditingController(text: property?.owner ?? '');
    _addressController = TextEditingController(text: property?.address ?? '');
    _latitudeController = TextEditingController(
      text: property != null ? property.latitude.toString() : '',
    );
    _longitudeController = TextEditingController(
      text: property != null ? property.longitude.toString() : '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ownerController.dispose();
    _addressController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    super.dispose();
  }

  Future<void> _save() => saveCatalogForm(
    _formKey,
    failureMessage: 'Não foi possível salvar a propriedade. Tente novamente.',
    action: () => widget.initialProperty == null
        ? widget.catalogRepository.createProperty(
            name: _nameController.text.trim(),
            owner: _ownerController.text.trim(),
            address: _addressController.text.trim(),
            latitude: double.parse(_latitudeController.text.trim()),
            longitude: double.parse(_longitudeController.text.trim()),
          )
        : widget.catalogRepository.updateProperty(
            propertyId: widget.initialProperty!.id,
            userId:
                _newOwnerId == null ||
                    _newOwnerId!.isEmpty ||
                    _newOwnerId == widget.initialProperty!.userId
                ? null
                : _newOwnerId,
            name: _nameController.text.trim(),
            owner: _ownerController.text.trim(),
            address: _addressController.text.trim(),
            latitude: double.parse(_latitudeController.text.trim()),
            longitude: double.parse(_longitudeController.text.trim()),
          ),
  );

  Future<void> _openLocationPicker() async {
    final current = _currentCoordinateInput();
    final selected = await LocationPickerScreen.show(
      context,
      title: 'Selecionar coordenadas da propriedade',
      confirmButtonLabel: 'Usar ponto selecionado',
      initialLatitude: current?.latitude,
      initialLongitude: current?.longitude,
    );
    if (selected == null || !mounted) return;
    setState(() {
      _latitudeController.text = selected.latitude.toStringAsFixed(6);
      _longitudeController.text = selected.longitude.toStringAsFixed(6);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialProperty != null;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: isEditing ? 'Editar propriedade' : 'Criar propriedade',
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: CustomButton(
            label: 'Salvar propriedade',
            onPressed: _save,
            isLoading: saving,
            icon: Icons.save_outlined,
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
          children: [
            CustomTextField(
              controller: _nameController,
              label: 'Nome da propriedade',
              prefixIcon: const Icon(Icons.home_work_outlined),
              validator: (value) =>
                  validateRequiredText(value, 'Nome da propriedade'),
            ),
            if (isEditing && widget.catalogRepository.currentUserIsAdmin)
              CustomTextField(
                hint: widget.initialProperty!.userId,
                validator: (value) => value == null || value.trim().isEmpty
                    ? null
                    : validateCatalogUuid(value),
                label: 'ID do novo proprietário do registro',
                onChanged: (value) => _newOwnerId = value.trim(),
              ),
            CustomTextField(
              controller: _ownerController,
              label: 'Proprietário',
              prefixIcon: const Icon(Icons.person_outline),
              validator: (value) => validateRequiredText(value, 'Proprietário'),
            ),
            CustomTextField(
              controller: _addressController,
              label: 'Endereço',
              prefixIcon: const Icon(Icons.location_on_outlined),
              validator: (value) => validateRequiredText(value, 'Endereço'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: CustomTextField(
                    controller: _latitudeController,
                    label: 'Latitude',
                    readOnly: true,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    prefixIcon: const Icon(Icons.north_outlined),
                    validator: (value) => validateRequiredDecimal(
                      value,
                      'Latitude',
                      min: -90,
                      max: 90,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: CustomTextField(
                    controller: _longitudeController,
                    label: 'Longitude',
                    readOnly: true,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    prefixIcon: const Icon(Icons.east_outlined),
                    validator: (value) => validateRequiredDecimal(
                      value,
                      'Longitude',
                      min: -180,
                      max: 180,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _openLocationPicker,
                icon: const Icon(Icons.map_outlined),
                label: const Text('Selecionar no mapa'),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Toque no mapa para ajustar as coordenadas.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (saveError != null) ...[
              const SizedBox(height: 16),
              Text(saveError!, style: const TextStyle(color: Colors.red)),
            ],
          ],
        ),
      ),
    );
  }
}

class TalhaoFormScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final Property property;
  final Talhao? initialTalhao;

  const TalhaoFormScreen({
    super.key,
    required this.catalogRepository,
    required this.property,
    this.initialTalhao,
  });

  @override
  State<TalhaoFormScreen> createState() => _TalhaoFormScreenState();
}

class _TalhaoFormScreenState extends State<TalhaoFormScreen>
    with CatalogFormSaveMixin<TalhaoFormScreen> {
  late Future<List<Property>> _parents;
  late String _parentId;
  String? _newOwnerId;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _propertyController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initialTalhao?.name ?? '',
    );
    _propertyController = TextEditingController(text: widget.property.name);
    _parentId = widget.initialTalhao?.propertyId ?? widget.property.id;
    _parents = widget.initialTalhao == null
        ? Future.value([widget.property])
        : widget.catalogRepository.getProperties();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _propertyController.dispose();
    super.dispose();
  }

  Future<void> _save() => saveCatalogForm(
    _formKey,
    failureMessage: 'Não foi possível salvar o talhão. Tente novamente.',
    action: () => widget.initialTalhao == null
        ? widget.catalogRepository.createTalhao(
            name: _nameController.text.trim(),
            propertyId: widget.property.id,
          )
        : widget.catalogRepository.updateTalhao(
            talhaoId: widget.initialTalhao!.id,
            userId:
                _newOwnerId == null ||
                    _newOwnerId!.isEmpty ||
                    _newOwnerId == widget.initialTalhao!.userId
                ? null
                : _newOwnerId,
            name: _nameController.text.trim(),
            propertyId: _parentId == widget.initialTalhao!.propertyId
                ? null
                : _parentId,
          ),
  );

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialTalhao != null;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: isEditing ? 'Editar talhão' : 'Novo talhão',
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: CustomButton(
            label: 'Salvar talhão',
            onPressed: _save,
            isLoading: saving,
            icon: Icons.save_outlined,
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            CustomTextField(
              controller: _nameController,
              label: 'Nome do talhão',
              prefixIcon: const Icon(Icons.crop_square_outlined),
              validator: (value) =>
                  validateRequiredText(value, 'Nome do talhão'),
            ),
            if (isEditing)
              FutureBuilder<List<Property>>(
                future: _parents,
                builder: (context, snapshot) {
                  final parents = {
                    widget.property.id: widget.property,
                    for (final item in snapshot.data ?? <Property>[])
                      if (!item.isPendingSync) item.id: item,
                  };
                  return DropdownButtonFormField<String>(
                    initialValue: _parentId,
                    decoration: const InputDecoration(
                      labelText: 'Propriedade',
                      border: OutlineInputBorder(),
                    ),
                    isExpanded: true,
                    items: [
                      if (!parents.containsKey(_parentId))
                        DropdownMenuItem(
                          value: _parentId,
                          enabled: false,
                          child: Text(
                            snapshot.connectionState == ConnectionState.waiting
                                ? 'Carregando propriedade atual…'
                                : 'Propriedade atual indisponível',
                          ),
                        ),
                      ...parents.values.map(
                        (item) => DropdownMenuItem(
                          value: item.id,
                          child: Text(
                            item.name,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: saving
                        ? null
                        : (value) {
                            if (value != null) {
                              setState(() => _parentId = value);
                            }
                          },
                  );
                },
              )
            else
              CustomTextField(
                label: 'Propriedade',
                prefixIcon: const Icon(Icons.home_work_outlined),
                readOnly: !isEditing,
                controller: _propertyController,
              ),
            if (isEditing && widget.catalogRepository.currentUserIsAdmin)
              CustomTextField(
                hint: widget.initialTalhao!.userId,
                validator: (value) => value == null || value.trim().isEmpty
                    ? null
                    : validateCatalogUuid(value),
                label: 'ID do novo proprietário',
                onChanged: (value) => _newOwnerId = value.trim(),
              ),
            if (saveError != null) ...[
              const SizedBox(height: 16),
              Text(saveError!, style: const TextStyle(color: Colors.red)),
            ],
          ],
        ),
      ),
    );
  }
}
