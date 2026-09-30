import 'package:flutter/material.dart';
import '../models/catalog.dart';
import '../services/catalog_repository.dart';
import '../utils/catalog_validation.dart';
import '../widgets/catalog_widgets.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_text_field.dart';

class CropTypeCatalogScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;

  const CropTypeCatalogScreen({super.key, required this.catalogRepository});

  @override
  State<CropTypeCatalogScreen> createState() => _CropTypeCatalogScreenState();
}

class _CropTypeCatalogScreenState extends State<CropTypeCatalogScreen> {
  final _searchController = TextEditingController();
  List<CropType> _cropTypes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadCropTypes();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCropTypes({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cropTypes = await widget.catalogRepository.getCropTypes(
        forceRefresh: forceRefresh,
      );
      if (mounted) setState(() => _cropTypes = cropTypes);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível carregar as culturas. Verifique a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<CropType> get _filteredCropTypes {
    final query = _searchController.text;
    return _cropTypes
        .where((cropType) => matchesSearchQuery(cropType.name, query))
        .toList();
  }

  Future<void> _openCreateForm() async {
    final created = await Navigator.of(context).push<CropType>(
      MaterialPageRoute(
        builder: (_) =>
            CropTypeFormScreen(catalogRepository: widget.catalogRepository),
      ),
    );
    if (!mounted || created == null) return;
    await _loadCropTypes();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            created.isPendingSync
                ? 'Cultura salva localmente e será sincronizada quando houver conexão.'
                : 'Cultura criada com sucesso.',
          ),
        ),
      );
    }
  }

  Future<void> _openEditForm(CropType cropType) async {
    final updated = await Navigator.of(context).push<CropType>(
      MaterialPageRoute(
        builder: (_) => CropTypeFormScreen(
          catalogRepository: widget.catalogRepository,
          initialCropType: cropType,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    await _loadCropTypes();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cultura atualizada com sucesso')),
      );
    }
  }

  Future<void> _deleteCropType(CropType cropType) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await confirmDestructiveAction(
      context,
      title: 'Excluir cultura?',
      message:
          'Excluir "${cropType.name}" também remove os estádios associados.',
    );
    if (!confirmed) return;

    try {
      await widget.catalogRepository.deleteCropType(cropTypeId: cropType.id);
      if (!mounted) return;
      await _loadCropTypes();
      messenger.showSnackBar(const SnackBar(content: Text('Cultura excluída')));
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Não foi possível excluir a cultura. Tente novamente.'),
        ),
      );
    }
  }

  void _showPendingSyncBlockedMessage() =>
      showPendingSyncBlockedMessage(context);

  Future<void> _openDetails(CropType cropType) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CropTypeDetailScreen(
          catalogRepository: widget.catalogRepository,
          cropType: cropType,
        ),
      ),
    );
    if (mounted) {
      await _loadCropTypes(forceRefresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredCropTypes;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(
          context,
          onPressed: () => Navigator.of(context).pop(true),
        ),
        title: 'Culturas',
        actions: [
          CustomAppBarAction(
            child: IconButton(
              onPressed: () => _loadCropTypes(forceRefresh: true),
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
        onRefresh: () => _loadCropTypes(forceRefresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            CatalogSearchField(
              controller: _searchController,
              hintText: 'Buscar culturas',
              onChanged: () => setState(() {}),
            ),
            const SizedBox(height: 16),
            if (!_loading && _error == null)
              CatalogCountBanner(
                icon: Icons.eco_outlined,
                text: _searchController.text.isNotEmpty
                    ? '${filtered.length} ${filtered.length == 1 ? 'resultado' : 'resultados'} de ${_cropTypes.length} ${_cropTypes.length == 1 ? 'cultura' : 'culturas'}.'
                    : '${filtered.length} ${filtered.length == 1 ? 'cultura cadastrada' : 'culturas cadastradas'}.',
              ),
            ...catalogListChildren(
              loading: _loading,
              error: _error,
              errorTitle: 'Erro ao carregar culturas',
              onRetry: () => _loadCropTypes(forceRefresh: true),
              listIsEmpty: filtered.isEmpty,
              emptyIcon: Icons.local_florist_outlined,
              emptyTitle: _cropTypes.isEmpty
                  ? 'Nenhuma cultura cadastrada'
                  : 'Nenhum resultado para a busca',
              emptyMessage: _cropTypes.isEmpty
                  ? 'Cadastre a primeira cultura para começar.'
                  : 'Ajuste o filtro de pesquisa.',
              emptyActionLabel: _cropTypes.isEmpty ? 'Nova cultura' : null,
              emptyAction: _cropTypes.isEmpty ? _openCreateForm : null,
              items: () =>
                  filtered.map((cropType) => _cropTypeCard(cropType)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cropTypeCard(CropType cropType) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CatalogIconBox(icon: Icons.eco_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  cropType.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          CatalogDetailText(
            cropType.isPendingSync
                ? 'Pendente de sincronização'
                : 'Gerencie os estádios desta cultura e use nos uploads.',
          ),
          const SizedBox(height: 6),
          CatalogActionRow(
            actions: [
              CatalogAction(
                label: 'Estádios',
                icon: Icons.timeline_outlined,
                onPressed: () => _openDetails(cropType),
              ),
              if (widget.catalogRepository.canMutate(cropType)) ...[
                CatalogAction(
                  label: 'Editar',
                  icon: Icons.edit_outlined,
                  onPressed: cropType.isPendingSync
                      ? _showPendingSyncBlockedMessage
                      : () => _openEditForm(cropType),
                ),
                CatalogAction(
                  label: 'Excluir',
                  icon: Icons.delete_outline,
                  onPressed: cropType.isPendingSync
                      ? _showPendingSyncBlockedMessage
                      : () => _deleteCropType(cropType),
                ),
              ],
            ],
          ),
        ],
      ),
    ),
  );
}

class CropTypeDetailScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final CropType cropType;

  const CropTypeDetailScreen({
    super.key,
    required this.catalogRepository,
    required this.cropType,
  });

  @override
  State<CropTypeDetailScreen> createState() => _CropTypeDetailScreenState();
}

class _CropTypeDetailScreenState extends State<CropTypeDetailScreen> {
  late CropType _cropType;
  final _searchController = TextEditingController();
  List<Estadio> _estadios = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cropType = widget.cropType;
    _loadEstadios();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadEstadios({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final estadios = await widget.catalogRepository.getEstadios(
        forceRefresh: forceRefresh,
      );
      if (mounted) {
        setState(() {
          _estadios = estadios
              .where((estadio) => estadio.cropTypeId == _cropType.id)
              .toList();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível carregar os estádios. Verifique a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showPendingSyncBlockedMessage() =>
      showPendingSyncBlockedMessage(context);

  List<Estadio> get _filteredEstadios {
    final query = _searchController.text;
    return _estadios
        .where((estadio) => matchesSearchQuery(estadio.name, query))
        .toList();
  }

  Future<void> _editCropType() async {
    final updated = await Navigator.of(context).push<CropType>(
      MaterialPageRoute(
        builder: (_) => CropTypeFormScreen(
          catalogRepository: widget.catalogRepository,
          initialCropType: _cropType,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    setState(() => _cropType = updated);
    await _loadEstadios();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cultura atualizada com sucesso')),
      );
    }
  }

  Future<void> _createEstadio() async {
    final created = await Navigator.of(context).push<Estadio>(
      MaterialPageRoute(
        builder: (_) => EstadioFormScreen(
          catalogRepository: widget.catalogRepository,
          cropType: _cropType,
        ),
      ),
    );
    if (!mounted || created == null) return;
    await _loadEstadios();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            created.isPendingSync
                ? 'Estádio salvo localmente e será sincronizado quando houver conexão.'
                : 'Estádio criado com sucesso.',
          ),
        ),
      );
    }
  }

  Future<void> _editEstadio(Estadio estadio) async {
    final updated = await Navigator.of(context).push<Estadio>(
      MaterialPageRoute(
        builder: (_) => EstadioFormScreen(
          catalogRepository: widget.catalogRepository,
          cropType: _cropType,
          initialEstadio: estadio,
        ),
      ),
    );
    if (!mounted || updated == null) return;
    await _loadEstadios();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Estádio atualizado com sucesso')),
      );
    }
  }

  Future<void> _deleteEstadio(Estadio estadio) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await confirmDestructiveAction(
      context,
      title: 'Excluir estádio?',
      message: 'Excluir "${estadio.name}"?',
    );
    if (!confirmed) return;

    try {
      await widget.catalogRepository.deleteEstadio(estadioId: estadio.id);
      if (!mounted) return;
      await _loadEstadios();
      messenger.showSnackBar(const SnackBar(content: Text('Estádio excluído')));
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Não foi possível excluir o estádio. Tente novamente.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final estadios = _filteredEstadios;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: _cropType.name,
        subtitle: 'Estádios da cultura',
        actions: [
          CustomAppBarAction(
            child: IconButton(
              onPressed: () => _loadEstadios(forceRefresh: true),
              icon: const Icon(Icons.refresh, color: Colors.white),
              tooltip: 'Atualizar',
            ),
          ),
          if (widget.catalogRepository.canMutate(_cropType))
            CustomAppBarAction(
              child: IconButton(
                onPressed: _cropType.isPendingSync ? null : _editCropType,
                icon: const Icon(Icons.edit, color: Colors.white),
                tooltip: 'Editar cultura',
              ),
            ),
        ],
      ),
      floatingActionButton: widget.catalogRepository.canMutate(_cropType)
          ? FloatingActionButton(
              onPressed: _createEstadio,
              tooltip: 'Novo estádio',
              child: const Icon(Icons.add),
            )
          : null,

      body: RefreshIndicator(
        onRefresh: () => _loadEstadios(forceRefresh: true),
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
                      'Cultura',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    CatalogDetailRow(label: 'Nome', value: _cropType.name),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            CatalogSearchField(
              controller: _searchController,
              hintText: 'Buscar estádios',
              onChanged: () => setState(() {}),
            ),
            const SizedBox(height: 16),
            if (!_loading && _error == null)
              CatalogCountBanner(
                icon: Icons.grass_outlined,
                text: _searchController.text.isNotEmpty
                    ? '${estadios.length} ${estadios.length == 1 ? 'resultado' : 'resultados'} de ${_estadios.length} ${estadios.length == 1 ? 'estádio' : 'estádios'}'
                    : '${estadios.length} ${estadios.length == 1 ? 'estádio cadastrado' : 'estádios cadastrados'}',
              ),
            ...catalogListChildren(
              loading: _loading,
              error: _error,
              errorTitle: 'Erro ao carregar estádios',
              onRetry: () => _loadEstadios(forceRefresh: true),
              listIsEmpty: estadios.isEmpty,
              emptyIcon: Icons.grass_outlined,
              emptyTitle: _estadios.isEmpty
                  ? 'Nenhum estádio cadastrado'
                  : 'Nenhum resultado para a busca',
              emptyMessage: _estadios.isEmpty
                  ? 'Adicione o primeiro estádio desta cultura.'
                  : 'Ajuste o filtro de pesquisa.',
              emptyActionLabel:
                  _estadios.isEmpty &&
                      widget.catalogRepository.canMutate(_cropType)
                  ? 'Novo estádio'
                  : null,
              emptyAction:
                  _estadios.isEmpty &&
                      widget.catalogRepository.canMutate(_cropType)
                  ? _createEstadio
                  : null,
              items: () =>
                  estadios.map((estadio) => _estadioCard(estadio)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _estadioCard(Estadio estadio) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CatalogIconBox(icon: Icons.spa_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  estadio.name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          CatalogDetailText(
            estadio.isPendingSync
                ? 'Pendente de sincronização'
                : 'Cultura: ${_cropType.name}',
          ),
          if (widget.catalogRepository.canMutate(estadio)) ...[
            const SizedBox(height: 6),
            CatalogActionRow(
              actions: [
                CatalogAction(
                  label: 'Editar',
                  icon: Icons.edit_outlined,
                  onPressed: estadio.isPendingSync
                      ? _showPendingSyncBlockedMessage
                      : () => _editEstadio(estadio),
                ),
                CatalogAction(
                  label: 'Excluir',
                  icon: Icons.delete_outline,
                  onPressed: estadio.isPendingSync
                      ? _showPendingSyncBlockedMessage
                      : () => _deleteEstadio(estadio),
                ),
              ],
            ),
          ],
        ],
      ),
    ),
  );
}

class CropTypeFormScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final CropType? initialCropType;

  const CropTypeFormScreen({
    super.key,
    required this.catalogRepository,
    this.initialCropType,
  });

  @override
  State<CropTypeFormScreen> createState() => _CropTypeFormScreenState();
}

class _CropTypeFormScreenState extends State<CropTypeFormScreen>
    with CatalogFormSaveMixin<CropTypeFormScreen> {
  String? _newOwnerId;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initialCropType?.name ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() => saveCatalogForm(
    _formKey,
    failureMessage: 'Não foi possível salvar a cultura. Tente novamente.',
    action: () => widget.initialCropType == null
        ? widget.catalogRepository.createCropType(
            name: _nameController.text.trim(),
          )
        : widget.catalogRepository.updateCropType(
            cropTypeId: widget.initialCropType!.id,
            userId:
                _newOwnerId == null ||
                    _newOwnerId!.isEmpty ||
                    _newOwnerId == widget.initialCropType!.userId
                ? null
                : _newOwnerId,
            name: _nameController.text.trim(),
          ),
  );

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialCropType != null;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: isEditing ? 'Editar cultura' : 'Nova cultura',
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          children: [
            CustomTextField(
              controller: _nameController,
              label: 'Nome da cultura',
              validator: (value) =>
                  validateRequiredText(value, 'Nome da cultura'),
            ),
            if (isEditing && widget.catalogRepository.currentUserIsAdmin)
              CustomTextField(
                hint: widget.initialCropType!.userId,
                validator: (value) => value == null || value.trim().isEmpty
                    ? null
                    : validateCatalogUuid(value),
                label: 'ID do novo proprietário',
                onChanged: (value) => _newOwnerId = value.trim(),
              ),
            if (saveError != null) ...[
              const SizedBox(height: 0),
              Text(
                saveError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 8),
            CustomButton(
              label: 'Salvar',
              icon: Icons.save,
              onPressed: _save,
              isLoading: saving,
            ),
          ],
        ),
      ),
    );
  }
}

class EstadioFormScreen extends StatefulWidget {
  final CatalogRepository catalogRepository;
  final CropType cropType;
  final Estadio? initialEstadio;

  const EstadioFormScreen({
    super.key,
    required this.catalogRepository,
    required this.cropType,
    this.initialEstadio,
  });

  @override
  State<EstadioFormScreen> createState() => _EstadioFormScreenState();
}

class _EstadioFormScreenState extends State<EstadioFormScreen>
    with CatalogFormSaveMixin<EstadioFormScreen> {
  late Future<List<CropType>> _parents;
  late String _parentId;
  String? _newOwnerId;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _cropTypeController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.initialEstadio?.name ?? '',
    );
    _cropTypeController = TextEditingController(text: widget.cropType.name);
    _parentId = widget.initialEstadio?.cropTypeId ?? widget.cropType.id;
    _parents = widget.initialEstadio == null
        ? Future.value([widget.cropType])
        : widget.catalogRepository.getCropTypes();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cropTypeController.dispose();
    super.dispose();
  }

  Future<void> _save() => saveCatalogForm(
    _formKey,
    failureMessage: 'Não foi possível salvar o estádio. Tente novamente.',
    action: () => widget.initialEstadio == null
        ? widget.catalogRepository.createEstadio(
            name: _nameController.text.trim(),
            cropTypeId: widget.cropType.id,
          )
        : widget.catalogRepository.updateEstadio(
            estadioId: widget.initialEstadio!.id,
            userId:
                _newOwnerId == null ||
                    _newOwnerId!.isEmpty ||
                    _newOwnerId == widget.initialEstadio!.userId
                ? null
                : _newOwnerId,
            name: _nameController.text.trim(),
            cropTypeId: _parentId == widget.initialEstadio!.cropTypeId
                ? null
                : _parentId,
          ),
  );

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialEstadio != null;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: isEditing ? 'Editar estádio' : 'Novo estádio',
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          children: [
            CustomTextField(
              controller: _nameController,
              label: 'Nome do estádio',
              validator: (value) =>
                  validateRequiredText(value, 'Nome do estádio'),
            ),
            if (isEditing)
              FutureBuilder<List<CropType>>(
                future: _parents,
                builder: (context, snapshot) {
                  final parents = {
                    widget.cropType.id: widget.cropType,
                    for (final item in snapshot.data ?? <CropType>[])
                      if (!item.isPendingSync) item.id: item,
                  };
                  return DropdownButtonFormField<String>(
                    initialValue: _parentId,
                    decoration: const InputDecoration(
                      labelText: 'Cultura',
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
                                ? 'Carregando cultura atual…'
                                : 'Cultura atual indisponível',
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
                label: 'Cultura',
                controller: _cropTypeController,
                readOnly: !isEditing,
              ),
            if (isEditing && widget.catalogRepository.currentUserIsAdmin)
              CustomTextField(
                hint: widget.initialEstadio!.userId,
                validator: (value) => value == null || value.trim().isEmpty
                    ? null
                    : validateCatalogUuid(value),
                label: 'ID do novo proprietário',
                onChanged: (value) => _newOwnerId = value.trim(),
              ),
            if (saveError != null) ...[
              const SizedBox(height: 0),
              Text(
                saveError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 8),
            CustomButton(
              label: 'Salvar',
              icon: Icons.save,
              onPressed: _save,
              isLoading: saving,
            ),
          ],
        ),
      ),
    );
  }
}
