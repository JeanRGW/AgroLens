import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:uuid/uuid.dart';
import '../models/pending_upload.dart';
import '../models/catalog.dart';
import '../services/auth_service.dart';
import '../services/database_helper.dart';
import '../services/catalog_repository.dart';
import '../services/local_image_store.dart';
import '../services/location_service.dart';
import '../utils/app_logger.dart';
import '../utils/upload_validation.dart';
import 'location_picker_screen.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_button.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/local_image_view.dart';

class _SelectedImage {
  final XFile file;
  final String origin;
  LatLng? location;
  bool gpsPending = false;

  _SelectedImage(this.file, {required this.origin});
}

/// Upload creation screen: select images, capture GPS (with manual fallback),
/// fill metadata, and save to the pending uploads queue.
///
/// Catalog-backed dropdowns with filtering. If catalogs fail to load, falls
/// back to manual ID text fields.
class CreateUploadScreen extends StatefulWidget {
  final AuthService authService;
  final DatabaseHelper databaseHelper;
  final CatalogRepository catalogRepository;
  final List<XFile> initialImages;
  final ImagePicker? imagePicker;
  final LocationService locationService;
  final LocalImageStore? imageStore;

  const CreateUploadScreen({
    super.key,
    required this.authService,
    required this.databaseHelper,
    required this.catalogRepository,
    this.initialImages = const [],
    this.imagePicker,
    this.locationService = const LocationService(),
    this.imageStore,
  });

  @override
  State<CreateUploadScreen> createState() => _CreateUploadScreenState();
}

class _CreateUploadScreenState extends State<CreateUploadScreen> {
  final _formKey = GlobalKey<FormState>();
  final _uuid = const Uuid();
  late final ImagePicker _picker;
  late final LocalImageStore _imageStore =
      widget.imageStore ?? createLocalImageStore();

  // Image selection
  final List<_SelectedImage> _selectedImages = [];
  bool _loadingImages = false;

  // GPS / coordinates
  double? _latitude;
  double? _longitude;
  bool _useGps = true;
  String? _gpsError;

  // Catalog-backed metadata (dropdown selections)
  Property? _selectedProperty;
  Talhao? _selectedTalhao;
  CropType? _selectedCropType;
  Estadio? _selectedEstadio;
  String _source = 'phone';

  // Manual ID fallback (shown when catalog load fails)
  final _propertyIdController = TextEditingController();
  final _talhaoIdController = TextEditingController();
  final _cropTypeIdController = TextEditingController();
  final _estadioIdController = TextEditingController();

  // Catalog data
  List<Property> _properties = [];
  List<Talhao> _talhoes = [];
  List<CropType> _cropTypes = [];
  List<Estadio> _estadios = [];
  bool _loadingCatalogs = true;
  bool _catalogLoadFailed = false;

  // Filtered lists
  List<Talhao> get _filteredTalhoes {
    if (_selectedProperty == null) return _talhoes;
    return _talhoes
        .where((t) => t.propertyId == _selectedProperty!.id)
        .toList();
  }

  List<Estadio> get _filteredEstadios {
    if (_selectedCropType == null) return _estadios;
    return _estadios
        .where((e) => e.cropTypeId == _selectedCropType!.id)
        .toList();
  }

  bool _saving = false;
  bool _confirmingExit = false;
  String? _error;
  int get _missingLocationCount => _selectedImages
      .where(
        (image) => image.location == null && (!_useGps || !image.gpsPending),
      )
      .length;

  @override
  void initState() {
    super.initState();
    _picker = widget.imagePicker ?? ImagePicker();
    _selectedImages.addAll(
      widget.initialImages.map(
        (file) => _SelectedImage(file, origin: 'gallery'),
      ),
    );
    _loadCatalogs();
    if (_selectedImages.isNotEmpty) {
      _attemptGps(images: List.of(_selectedImages));
    }
  }

  @override
  void dispose() {
    _propertyIdController.dispose();
    _talhaoIdController.dispose();
    _cropTypeIdController.dispose();
    _estadioIdController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalogs() async {
    setState(() {
      _loadingCatalogs = true;
      _catalogLoadFailed = false;
    });
    try {
      final results = await Future.wait([
        widget.catalogRepository.getProperties(),
        widget.catalogRepository.getTalhoes(),
        widget.catalogRepository.getCropTypes(),
        widget.catalogRepository.getEstadios(),
      ]);
      final properties = results[0] as List<Property>;
      final talhoes = results[1] as List<Talhao>;
      final cropTypes = results[2] as List<CropType>;
      final estadios = results[3] as List<Estadio>;
      if (mounted) {
        setState(() {
          _properties = properties;
          _talhoes = talhoes;
          _cropTypes = cropTypes;
          _estadios = estadios;

          final syncedProperties = properties
              .where((p) => !p.isPendingSync)
              .toList();
          final syncedCropTypes = cropTypes
              .where((c) => !c.isPendingSync)
              .toList();

          _selectedProperty ??= syncedProperties.isNotEmpty
              ? syncedProperties.first
              : (properties.isNotEmpty ? properties.first : null);
          _selectedCropType ??= syncedCropTypes.isNotEmpty
              ? syncedCropTypes.first
              : (cropTypes.isNotEmpty ? cropTypes.first : null);

          final matchingTalhoes = talhoes
              .where(
                (t) =>
                    _selectedProperty == null ||
                    t.propertyId == _selectedProperty!.id,
              )
              .toList();
          final syncedMatchingTalhoes = matchingTalhoes
              .where((t) => !t.isPendingSync)
              .toList();

          final matchingEstadios = estadios
              .where(
                (e) =>
                    _selectedCropType == null ||
                    e.cropTypeId == _selectedCropType!.id,
              )
              .toList();
          final syncedMatchingEstadios = matchingEstadios
              .where((e) => !e.isPendingSync)
              .toList();

          _selectedTalhao ??= syncedMatchingTalhoes.isNotEmpty
              ? syncedMatchingTalhoes.first
              : (matchingTalhoes.isNotEmpty ? matchingTalhoes.first : null);
          _selectedEstadio ??= syncedMatchingEstadios.isNotEmpty
              ? syncedMatchingEstadios.first
              : (matchingEstadios.isNotEmpty ? matchingEstadios.first : null);
          _loadingCatalogs = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingCatalogs = false;
          _catalogLoadFailed = true;
          _error =
              'Não foi possível carregar os catálogos. Use os IDs manualmente.';
        });
      }
    }
  }

  Future<void> _attemptGps({
    bool force = false,
    List<_SelectedImage> images = const [],
  }) async {
    if ((!_useGps && !force) || (!force && images.isEmpty)) return;
    if (mounted) {
      setState(() {
        _gpsError = null;
        if (!force) {
          for (final image in images) {
            image.gpsPending = true;
          }
        }
      });
    }
    try {
      final position = await widget.locationService.getCurrentPosition();
      if (mounted && (_useGps || force)) {
        setState(() {
          _latitude = position.latitude;
          _longitude = position.longitude;
          _gpsError = null;
          for (final image in force ? _selectedImages : images) {
            if (_selectedImages.contains(image)) image.location ??= position;
          }
        });
      }
    } on LocationException catch (e) {
      if (mounted && (_useGps || force)) {
        setState(() => _gpsError = e.message);
      }
    } catch (_) {
      if (mounted && (_useGps || force)) {
        setState(
          () => _gpsError = 'Não foi possível obter sua localização atual.',
        );
      }
    } finally {
      if (mounted && !force) {
        setState(() {
          for (final image in images) {
            image.gpsPending = false;
          }
        });
      }
    }
  }

  Future<void> _openLocationPicker({int? imageIndex}) async {
    final current = imageIndex == null
        ? (_latitude != null && _longitude != null
              ? LatLng(_latitude!, _longitude!)
              : null)
        : _selectedImages[imageIndex].location;
    final selected = await LocationPickerScreen.show(
      context,
      title: 'Selecionar coordenadas',
      confirmButtonLabel: 'Usar ponto selecionado',
      initialLatitude: current?.latitude,
      initialLongitude: current?.longitude,
      showCurrentLocationButton: _useGps,
    );
    if (selected == null || !mounted) return;
    setState(() {
      _latitude = selected.latitude;
      _longitude = selected.longitude;
      _gpsError = null;
      if (imageIndex != null && imageIndex < _selectedImages.length) {
        _selectedImages[imageIndex].location = selected;
      } else if (imageIndex == null) {
        for (final image in _selectedImages) {
          image.location ??= selected;
        }
      }
    });
  }

  Future<void> _pickImages() async {
    if (_saving || _selectedImages.length >= maxUploadFiles) return;
    setState(() => _loadingImages = true);
    try {
      final remaining = maxUploadFiles - _selectedImages.length;
      final List<XFile> picked;
      if (remaining == 1) {
        final image = await _picker.pickImage(source: ImageSource.gallery);
        picked = image == null ? [] : [image];
      } else {
        picked = await _picker.pickMultiImage(limit: remaining);
      }
      if (mounted && picked.isNotEmpty) {
        final images = picked
            .take(remaining)
            .map((file) => _SelectedImage(file, origin: 'gallery'))
            .toList();
        setState(() => _selectedImages.addAll(images));
        await _attemptGps(images: images);
      }
    } on PlatformException catch (error) {
      // Cancellation completes with null instead of throwing, so reaching
      // this point means the gallery never opened (e.g. permission denial).
      AppLogger.warning('Gallery picker failed', error);
      if (mounted) {
        _showPickerErrorSnackBar(
          'Não foi possível abrir a galeria. Verifique as permissões do app.',
        );
      }
    } finally {
      if (mounted) setState(() => _loadingImages = false);
    }
  }

  Future<void> _captureCameraImage() async {
    if (_saving || _selectedImages.length >= maxUploadFiles) return;
    setState(() => _loadingImages = true);
    try {
      final photo = await _picker.pickImage(source: ImageSource.camera);
      if (mounted && photo != null) {
        final image = _SelectedImage(photo, origin: 'camera');
        setState(() {
          image.gpsPending = _useGps;
          _selectedImages.add(image);
          if (_useGps) _gpsError = null;
        });
        if (!_useGps) return;
        try {
          final point = await widget.locationService.getCurrentPosition();
          if (mounted && _useGps && _selectedImages.contains(image)) {
            setState(() => image.location ??= point);
          }
        } on LocationException catch (error) {
          if (mounted && _useGps) {
            setState(() => _gpsError = error.message);
          }
        } catch (_) {
          if (mounted && _useGps) {
            setState(
              () => _gpsError =
                  'Sem localização para a foto. Tente novamente ou escolha um ponto no mapa.',
            );
          }
        } finally {
          if (mounted) setState(() => image.gpsPending = false);
        }
      }
    } on PlatformException catch (error) {
      // Cancellation completes with null instead of throwing, so reaching
      // this point means the camera never opened (e.g. permission denial).
      AppLogger.warning('Camera capture failed', error);
      if (mounted) {
        _showPickerErrorSnackBar(
          'Não foi possível abrir a câmera. Verifique as permissões do app.',
        );
      }
    } finally {
      if (mounted) setState(() => _loadingImages = false);
    }
  }

  void _showPickerErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  void _removeImage(int index) {
    if (_saving) return;
    setState(() => _selectedImages.removeAt(index));
  }

  Future<void> _requestExit() async {
    if (_saving || _confirmingExit) return;
    if (_selectedImages.isEmpty) {
      Navigator.of(context).pop();
      return;
    }

    _confirmingExit = true;
    try {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Descartar upload?'),
          content: const Text(
            'As imagens selecionadas ainda não foram salvas. Deseja sair sem salvar?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Continuar edição'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Descartar e sair'),
            ),
          ],
        ),
      );
      if (discard == true && mounted && !_saving) Navigator.of(context).pop();
    } finally {
      _confirmingExit = false;
    }
  }

  /// Resolve the final catalog IDs from dropdown selections or manual inputs.
  String _resolvePropertyId() {
    if (_selectedProperty != null) return _selectedProperty!.id;
    return _propertyIdController.text.trim();
  }

  String _resolveTalhaoId() {
    if (_selectedTalhao != null) return _selectedTalhao!.id;
    return _talhaoIdController.text.trim();
  }

  String _resolveCropTypeId() {
    if (_selectedCropType != null) return _selectedCropType!.id;
    return _cropTypeIdController.text.trim();
  }

  String? _resolveEstadioId() {
    if (_selectedEstadio != null) return _selectedEstadio!.id;
    final manual = _estadioIdController.text.trim();
    return manual.isNotEmpty ? manual : null;
  }

  bool _validateManualIds() {
    if (_catalogLoadFailed) {
      return _propertyIdController.text.trim().isNotEmpty &&
          _talhaoIdController.text.trim().isNotEmpty &&
          _cropTypeIdController.text.trim().isNotEmpty;
    }
    // When using dropdowns, selections are validated at save
    return true;
  }

  Future<void> _save() async {
    if (_saving || _loadingImages) return;
    if (!_formKey.currentState!.validate()) return;
    if (!_validateManualIds()) {
      setState(() => _error = 'Os campos do catálogo são obrigatórios.');
      return;
    }

    if (_selectedImages.isEmpty) {
      setState(() => _error = 'Selecione pelo menos uma imagem.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final images = List<_SelectedImage>.of(_selectedImages);
    final propertyId = _resolvePropertyId();
    final talhaoId = _resolveTalhaoId();
    final cropTypeId = _resolveCropTypeId();
    final estadioId = _resolveEstadioId();
    final source = _source;
    final ownerId = widget.authService.currentUser?.id;
    final generation = widget.authService.sessionGeneration;

    try {
      final validationError = await validateUploadFiles(
        images.map((image) => image.file).toList(),
      );
      if (!mounted) return;
      if (validationError != null) {
        setState(() => _error = validationError);
        return;
      }
      final missing = images.where((image) => image.location == null).length;
      if (missing > 0) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Imagens sem localização'),
            content: Text(
              '$missing ${missing == 1 ? 'imagem está' : 'imagens estão'} sem coordenadas. Salvar mesmo assim?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Voltar e localizar'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Salvar sem localização'),
              ),
            ],
          ),
        );
        if (confirmed != true || !mounted) return;
      }

      await widget.databaseHelper.saveUploadImages(
        files: images.map((image) => image.file).toList(),
        imageStore: _imageStore,
        createUpload: (savedPaths) {
          if (widget.authService.currentUser?.id != ownerId ||
              widget.authService.sessionGeneration != generation) {
            throw StateError('Session changed');
          }

          // Create pending upload record
          return PendingUpload(
            id: _uuid.v4(),
            ownerId: ownerId,
            images: [
              for (var i = 0; i < images.length; i++)
                PendingImage(
                  path: savedPaths[i],
                  latitude: images[i].location?.latitude,
                  longitude: images[i].location?.longitude,
                  origin: images[i].origin,
                ),
            ],
            createdAt: DateTime.now(),
            activityDate: DateTime.now(),
            status: PendingUploadStatus.pending,
            propertyId: propertyId,
            talhaoId: talhaoId,
            cropTypeId: cropTypeId,
            estadioId: estadioId,
            source: source,
          );
        },
      );

      if (mounted) {
        Navigator.of(context).pop(true); // return success
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Não foi possível salvar o lote: $e');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ── Build helpers ──────────────────────────────────────────────────

  Widget _buildDropdown<T extends CatalogItem>({
    required String label,
    required List<T> items,
    required T? selectedValue,
    required ValueChanged<T?> onChanged,
    bool required = true,
    String Function(T)? displayName,
  }) {
    final itemsWithNull = <T?>[null, ...items];
    return DropdownButtonFormField<T?>(
      initialValue: selectedValue,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      isExpanded: true,
      items: itemsWithNull.map((item) {
        if (item == null) {
          return DropdownMenuItem<T?>(
            value: null,
            child: Text(
              required ? 'Selecione $label' : 'Nenhum (opcional)',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          );
        }
        return DropdownMenuItem<T?>(
          value: item,
          child: Text(item.name, overflow: TextOverflow.ellipsis),
        );
      }).toList(),
      onChanged: (v) {
        onChanged(v);
        setState(() {});
      },
      validator: required ? (v) => (v == null) ? 'Obrigatório' : null : null,
    );
  }

  Widget _buildManualIdField({
    required TextEditingController controller,
    required String label,
    String? hintText,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText ?? 'Informe o UUID',
      ),
      validator:
          validator ??
          (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scaffold = CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(
          context,
          onPressed: _requestExit,
        ),
        title: 'Novo upload',
      ),
      body: _loadingCatalogs
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const SizedBox(height: 16),

                  // ── Catalog-backed dropdowns (with manual fallback) ──
                  if (_catalogLoadFailed) ...[
                    _buildManualIdField(
                      controller: _propertyIdController,
                      label: 'ID da propriedade',
                      hintText: 'Informe o UUID da propriedade',
                    ),
                    const SizedBox(height: 12),
                    _buildManualIdField(
                      controller: _talhaoIdController,
                      label: 'ID do talhão',
                      hintText: 'Informe o UUID do talhão',
                    ),
                    const SizedBox(height: 12),
                    _buildManualIdField(
                      controller: _cropTypeIdController,
                      label: 'ID da cultura',
                      hintText: 'Informe o UUID da cultura',
                    ),
                    const SizedBox(height: 12),
                    _buildManualIdField(
                      controller: _estadioIdController,
                      label: 'ID do estádio (opcional)',
                      hintText: 'Informe o UUID ou deixe vazio',
                      validator: (_) => null,
                    ),
                  ] else ...[
                    // Property dropdown
                    _buildDropdown<Property>(
                      label: 'Propriedade',
                      items: _properties,
                      selectedValue: _selectedProperty,
                      onChanged: (v) {
                        setState(() {
                          _selectedProperty = v;
                          // Clear talhao when property changes
                          if (v != null &&
                              (_selectedTalhao == null ||
                                  _selectedTalhao!.propertyId != v.id)) {
                            _selectedTalhao = null;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 12),

                    // Talhão dropdown (filtered by selected property)
                    _buildDropdown<Talhao>(
                      label: 'Talhão',
                      items: _filteredTalhoes,
                      selectedValue: _selectedTalhao,
                      onChanged: (v) {
                        setState(() => _selectedTalhao = v);
                      },
                    ),
                    if (_selectedProperty != null && _filteredTalhoes.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Nenhum talhão para esta propriedade',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.orange.shade800,
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),

                    // Crop type dropdown
                    _buildDropdown<CropType>(
                      label: 'Cultura',
                      items: _cropTypes,
                      selectedValue: _selectedCropType,
                      onChanged: (v) {
                        setState(() {
                          _selectedCropType = v;
                          // Clear estadio when crop type changes
                          if (v != null &&
                              (_selectedEstadio == null ||
                                  _selectedEstadio!.cropTypeId != v.id)) {
                            _selectedEstadio = null;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 12),

                    // Estádio dropdown (filtered by selected crop type)
                    _buildDropdown<Estadio>(
                      label: 'Estádio (opcional)',
                      items: _filteredEstadios,
                      selectedValue: _selectedEstadio,
                      onChanged: (v) {
                        setState(() => _selectedEstadio = v);
                      },
                      required: false,
                    ),
                    if (_selectedCropType != null && _filteredEstadios.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Nenhum estádio para esta cultura',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.orange.shade800,
                          ),
                        ),
                      ),
                  ],

                  const SizedBox(height: 12),

                  // Source dropdown
                  DropdownButtonFormField<String>(
                    initialValue: _source,
                    decoration: InputDecoration(
                      labelText: 'Origem',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(
                        value: 'phone',
                        child: Text('Celular', overflow: TextOverflow.ellipsis),
                      ),
                      DropdownMenuItem(
                        value: 'drone',
                        child: Text('Drone', overflow: TextOverflow.ellipsis),
                      ),
                      DropdownMenuItem(
                        value: 'mixed',
                        child: Text('Misto', overflow: TextOverflow.ellipsis),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _source = v);
                    },
                  ),
                  const SizedBox(height: 16),

                  // ── Coordinates ─────────────────────────────────────
                  SwitchListTile(
                    title: const Text('Usar localização automática (GPS)'),
                    subtitle: Text(
                      _useGps
                          ? 'A localização será obtida automaticamente'
                          : 'Selecione o ponto manualmente no mapa',
                    ),
                    value: _useGps,
                    onChanged: (value) {
                      setState(() {
                        _useGps = value;
                        _gpsError = null;
                      });
                    },
                    contentPadding: EdgeInsets.zero,
                  ),
                  if (_useGps)
                    OutlinedButton.icon(
                      onPressed: () => _attemptGps(force: true),
                      icon: const Icon(Icons.my_location),
                      label: const Text('Aplicar localização atual'),
                    ),
                  if (_gpsError != null)
                    Semantics(
                      liveRegion: true,
                      label: 'Erro de localização',
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            _gpsError!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (!_useGps)
                    SizedBox(
                      width: double.infinity,
                      child: CustomButton(
                        label: 'Selecionar no mapa',
                        icon: Icons.map_outlined,
                        onPressed: () => _openLocationPicker(),
                        isOutlined: true,
                      ),
                    ),

                  const SizedBox(height: 16),

                  // ── Image picker ────────────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: CustomButton(
                          label: 'Câmera',
                          icon: Icons.camera_alt,
                          onPressed:
                              _loadingImages ||
                                  _selectedImages.length >= maxUploadFiles
                              ? null
                              : _captureCameraImage,
                          isOutlined: true,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: CustomButton(
                          label: 'Galeria',
                          icon: Icons.photo_library,
                          onPressed:
                              _loadingImages ||
                                  _selectedImages.length >= maxUploadFiles
                              ? null
                              : _pickImages,
                          isOutlined: true,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Imagens selecionadas (${_selectedImages.length})',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  if (_selectedImages.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                      child: const Text('Nenhuma imagem selecionada.'),
                    )
                  else
                    SizedBox(
                      height: 120,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _selectedImages.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(width: 8),
                        itemBuilder: (context, index) => Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: pickedImageView(
                                _selectedImages[index].file,
                                width: 120,
                                height: 120,
                                fit: BoxFit.cover,
                                cacheWidth: 360,
                              ),
                            ),
                            Positioned(
                              bottom: 2,
                              left: 2,
                              child: Semantics(
                                button: true,
                                label: 'Localização da imagem ${index + 1}',
                                child: InkWell(
                                  onTap: () =>
                                      _openLocationPicker(imageIndex: index),
                                  child: Container(
                                    color: Colors.black87,
                                    padding: const EdgeInsets.all(3),
                                    child: Text(
                                      _selectedImages[index].location != null
                                          ? 'Localizada · ajustar'
                                          : _useGps &&
                                                _selectedImages[index]
                                                    .gpsPending
                                          ? 'Localizando · ajustar'
                                          : 'Sem localização · ajustar',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: Semantics(
                                button: true,
                                label: 'Remover imagem ${index + 1}',
                                child: InkWell(
                                  onTap: () => _removeImage(index),
                                  child: Container(
                                    padding: const EdgeInsets.all(2),
                                    decoration: const BoxDecoration(
                                      color: Colors.black54,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.close,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  if (_missingLocationCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        '$_missingLocationCount ${_missingLocationCount == 1 ? 'imagem precisa' : 'imagens precisam'} de localização.',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),

                  const SizedBox(height: 24),

                  // ── Error and save ──────────────────────────────────
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _error!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                  CustomButton(
                    label: 'Confirmar e preparar lote',
                    icon: Icons.cloud_upload,
                    onPressed: _loadingImages ? null : _save,
                    isLoading: _saving,
                  ),
                ],
              ),
            ),
    );
    return PopScope(
      canPop: !_saving && _selectedImages.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _requestExit();
      },
      child: AbsorbPointer(absorbing: _saving, child: scaffold),
    );
  }
}
