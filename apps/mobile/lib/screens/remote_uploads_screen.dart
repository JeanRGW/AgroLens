import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'inference_screen.dart';
import '../models/download_url_response.dart';
import '../models/upload_response.dart';
import '../models/catalog.dart';
import '../services/auth_service.dart';
import '../services/sync_service.dart';
import '../services/catalog_repository.dart';
import '../utils/open_map.dart';
import '../utils/source_labels.dart';
import '../widgets/catalog_widgets.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_button.dart';

/// Screen that lists `ready` uploads from the backend via `GET /uploads`.
///
/// Provides image previews, detail navigation, pull-to-refresh, and pagination.
class RemoteUploadsScreen extends StatefulWidget {
  final AuthService authService;
  final SyncService syncService;
  final CatalogRepository catalogRepository;

  const RemoteUploadsScreen({
    super.key,
    required this.authService,
    required this.syncService,
    required this.catalogRepository,
  });

  @override
  State<RemoteUploadsScreen> createState() => _RemoteUploadsScreenState();
}

class _RemoteUploadsScreenState extends State<RemoteUploadsScreen> {
  List<UploadDetail> _uploads = [];
  bool _loading = true;
  String? _error;

  static const int _pageSize = 20;
  // Pagination uses backend offset/limit parameters.
  int _currentOffset = 0;
  bool _hasMore = true;
  bool _loadingMore = false;
  int _loadGeneration = 0;
  // Per-upload preview URL futures so tiles share one fetch across rebuilds.
  final Map<String, Future<DownloadUrlResponse>> _listPreviewFutures = {};

  @override
  void initState() {
    super.initState();
    _loadUploads();
  }

  Future<void> _loadUploads({bool refresh = false}) async {
    if (!refresh &&
        (_loadingMore || (_loading && _loadGeneration > 0) || !_hasMore)) {
      return;
    }
    final generation = ++_loadGeneration;
    if (refresh) {
      setState(() {
        _currentOffset = 0;
        _hasMore = true;
        _uploads = [];
        _loadingMore = false;
        _listPreviewFutures.clear();
      });
    }

    if (_loadingMore || !_hasMore) return;

    setState(() {
      if (_currentOffset == 0) _loading = true;
      _error = null;
      _loadingMore = _currentOffset > 0;
    });

    try {
      final params = <String, String>{
        'limit': _pageSize.toString(),
        'offset': _currentOffset.toString(),
      };
      final results = await widget.syncService.fetchRemoteUploads(
        queryParams: params,
      );

      if (mounted && generation == _loadGeneration) {
        setState(() {
          _uploads.addAll(results);
          _hasMore = results.length >= _pageSize;
          _loading = false;
          _loadingMore = false;
          if (_hasMore) {
            _currentOffset += results.length;
          }
        });
      }
    } catch (e) {
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _loading = false;
          _loadingMore = false;
          _error =
              'Não foi possível carregar os uploads. Verifique a conexão e tente novamente.';
        });
      }
    }
  }

  Future<void> _loadNextPage() {
    _currentOffset = _uploads.length;
    return _loadUploads();
  }

  Future<DownloadUrlResponse>? _previewFutureFor(UploadDetail upload) {
    final fileId = upload.previewFileId;
    if (fileId == null || fileId.trim().isEmpty) return null;
    return _listPreviewFutures.putIfAbsent(
      upload.id,
      () => widget.syncService.fetchPreviewUrl(
        uploadId: upload.id,
        fileId: fileId,
      ),
    );
  }

  void _retryPreview(String uploadId) {
    final upload = _uploads.where((u) => u.id == uploadId).firstOrNull;
    if (upload == null || upload.previewFileId == null) return;
    setState(() {
      _listPreviewFutures[uploadId] = widget.syncService.fetchPreviewUrl(
        uploadId: uploadId,
        fileId: upload.previewFileId!,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Uploads remotos',
        subtitle: 'Arquivos enviados para a nuvem',
        actions: [
          CustomAppBarAction(
            child: IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: () => _loadUploads(refresh: true),
              tooltip: 'Atualizar lista',
            ),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _uploads.isEmpty) {
      return LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight - 16,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 48,
                        color: Colors.red,
                      ),
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: CustomButton(
                          label: 'Tentar novamente',
                          onPressed: () => _loadUploads(refresh: true),
                          icon: Icons.refresh,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
    }

    if (_uploads.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 48, color: Colors.grey),
            SizedBox(height: 12),
            Text('Nenhum upload remoto encontrado.'),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadUploads(refresh: true),
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(12),
        itemCount: (_uploads.length / 2).ceil() + (_hasMore ? 1 : 0),
        itemBuilder: (context, rowIndex) {
          final index = rowIndex * 2;
          if (index >= _uploads.length) {
            // Load-more indicator
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator()
                    : CustomButton(
                        width: 180,
                        height: 48,
                        onPressed: _loadNextPage,
                        label: 'Carregar mais',
                        icon: Icons.expand_more,
                      ),
              ),
            );
          }

          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _uploadTile(_uploads[index])),
                const SizedBox(width: 12),
                Expanded(
                  child: index + 1 < _uploads.length
                      ? _uploadTile(_uploads[index + 1])
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _uploadTile(UploadDetail upload) => _UploadListTile(
    upload: upload,
    syncService: widget.syncService,
    catalogRepository: widget.catalogRepository,
    previewFuture: _previewFutureFor(upload),
    onRetryPreview: () => _retryPreview(upload.id),
    onRefreshList: () => _loadUploads(refresh: true),
  );
}

/// A single upload tile in the remote list.
class _UploadListTile extends StatelessWidget {
  final UploadDetail upload;
  final SyncService syncService;
  final CatalogRepository catalogRepository;
  final Future<DownloadUrlResponse>? previewFuture;
  final VoidCallback onRetryPreview;
  final Future<void> Function() onRefreshList;

  const _UploadListTile({
    required this.upload,
    required this.syncService,
    required this.catalogRepository,
    required this.previewFuture,
    required this.onRetryPreview,
    required this.onRefreshList,
  });

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yy HH:mm');
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: InkWell(
        onTap: () async {
          final didDelete = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => _RemoteUploadDetailScreen(
                upload: upload,
                syncService: syncService,
                catalogRepository: catalogRepository,
              ),
            ),
          );
          if (didDelete == true) {
            await onRefreshList();
          }
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: _PreviewThumbnail(
                future: previewFuture,
                onRetry: onRetryPreview,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          dateFormat.format(upload.createdAt),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        Text(
                          '${upload.fileCount} ${upload.fileCount == 1 ? 'imagem' : 'imagens'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        if (upload.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Erro: ${upload.errorMessage}',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, size: 18),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResolvedCatalogNames {
  final String propertyName;
  final String talhaoName;
  final String cropTypeName;
  final String? estadioName;
  const _ResolvedCatalogNames({
    required this.propertyName,
    required this.talhaoName,
    required this.cropTypeName,
    this.estadioName,
  });
}

/// Preview image that fills the space provided by the upload card.
class _PreviewThumbnail extends StatelessWidget {
  final Future<DownloadUrlResponse>? future;
  final VoidCallback onRetry;

  const _PreviewThumbnail({required this.future, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DownloadUrlResponse>(
      future: future,
      builder: (context, snapshot) {
        final url = snapshot.data?.url;
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Container(
            color: Colors.grey.shade200,
            child: const Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        if (future == null) {
          return Container(
            color: Colors.grey.shade200,
            child: const Center(child: Icon(Icons.image_outlined, size: 40)),
          );
        }
        if (snapshot.hasError || url == null || url.trim().isEmpty) {
          return InkWell(
            onTap: onRetry,
            child: Tooltip(
              message: 'Tentar carregar imagem novamente',
              child: Container(
                color: Colors.grey.shade200,
                child: Icon(
                  Icons.broken_image_outlined,
                  color: Colors.grey.shade500,
                ),
              ),
            ),
          );
        }
        return Image.network(
          url,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => InkWell(
            onTap: onRetry,
            child: Container(
              color: Colors.grey.shade200,
              child: Icon(
                Icons.broken_image_outlined,
                color: Colors.grey.shade500,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Detail screen for a single remote upload.
class _RemoteUploadDetailScreen extends StatefulWidget {
  final UploadDetail upload;
  final SyncService syncService;
  final CatalogRepository catalogRepository;

  const _RemoteUploadDetailScreen({
    required this.upload,
    required this.syncService,
    required this.catalogRepository,
  });

  @override
  State<_RemoteUploadDetailScreen> createState() =>
      _RemoteUploadDetailScreenState();
}

class _RemoteUploadDetailScreenState extends State<_RemoteUploadDetailScreen> {
  late UploadDetail _upload;
  bool _refreshing = false;
  bool _downloadingFile = false;
  bool _deleting = false;
  String? _error;
  final Map<String, Future<DownloadUrlResponse>> _imageUrlFutures = {};
  Future<_ResolvedCatalogNames>? _catalogNamesFuture;
  final PageController _imagePageController = PageController(keepPage: false);
  int _activeImageIndex = 0;

  @override
  void initState() {
    super.initState();
    _upload = widget.upload;
    _catalogNamesFuture = _resolveCatalogNames(_upload);
    _refresh();
  }

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _refreshing = true;
      _error = null;
      _activeImageIndex = 0;
    });
    try {
      final refreshed = await widget.syncService.fetchRemoteUploadDetail(
        _upload.id,
      );
      if (mounted) {
        setState(() {
          _upload = refreshed;
          _imageUrlFutures.clear();
          _refreshing = false;
          _catalogNamesFuture = _resolveCatalogNames(refreshed);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _refreshing = false;
          _error = 'Não foi possível atualizar. Tente novamente.';
        });
      }
    }
  }

  Future<_ResolvedCatalogNames> _resolveCatalogNames(UploadDetail u) async {
    try {
      final props = await widget.catalogRepository.getProperties();
      final talhoes = await widget.catalogRepository.getTalhoes();
      final crops = await widget.catalogRepository.getCropTypes();
      final estadios = await widget.catalogRepository.getEstadios();
      return _ResolvedCatalogNames(
        propertyName: _nameForId(props, u.propertyId),
        talhaoName: _nameForId(talhoes, u.talhaoId),
        cropTypeName: _nameForId(crops, u.cropTypeId),
        estadioName: u.estadioId == null
            ? null
            : _nameForId(estadios, u.estadioId!),
      );
    } catch (_) {
      return _ResolvedCatalogNames(
        propertyName: _shortId(u.propertyId),
        talhaoName: _shortId(u.talhaoId),
        cropTypeName: _shortId(u.cropTypeId),
        estadioName: u.estadioId == null ? null : _shortId(u.estadioId!),
      );
    }
  }

  String _nameForId<T extends CatalogItem>(List<T> items, String id) {
    for (final item in items) {
      if (item.id == id) return item.name;
    }
    return _shortId(id);
  }

  String _shortId(String id) {
    final t = id.trim();
    if (t.isEmpty) return '—';
    if (t.length <= 12) return t;
    return '${t.substring(0, 8)}…';
  }

  Future<void> _deleteUpload() async {
    final confirmed = await confirmDestructiveAction(
      context,
      title: 'Excluir upload na nuvem?',
      message:
          'Isso remove o upload do servidor e atualiza a lista. A limpeza local da fila é feita separadamente no aparelho.',
      confirmLabel: 'Excluir na nuvem',
    );
    if (!confirmed) return;

    setState(() {
      _deleting = true;
      _error = null;
    });

    try {
      await widget.syncService.deleteRemoteUpload(_upload.id);
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _deleting = false;
          _error = 'Não foi possível excluir o upload. Tente novamente.';
        });
      }
    }
  }

  Future<DownloadUrlResponse> _imageUrlFor(UploadFileInfo file) {
    return _imageUrlFutures.putIfAbsent(
      file.id,
      () => file.variant == 'preview'
          ? widget.syncService.fetchPreviewUrl(
              uploadId: _upload.id,
              fileId: file.id,
            )
          : widget.syncService.fetchDownloadUrl(
              uploadId: _upload.id,
              fileId: file.id,
            ),
    );
  }

  Future<void> _openMap(UploadFileInfo file) async {
    final opened = await openMapCoordinates(file.latitude!, file.longitude!);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Não foi possível abrir o mapa. Tente novamente.'),
        ),
      );
    }
  }

  Future<void> _showImageViewer(String imageUrl, String title) async {
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black87,
      builder: (dialogContext) {
        return Dialog(
          insetPadding: EdgeInsets.zero,
          backgroundColor: Colors.black,
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
                  child: Center(
                    child: Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                      errorBuilder: (context, error, stackTrace) => const Icon(
                        Icons.broken_image,
                        color: Colors.white,
                        size: 64,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: MediaQuery.of(dialogContext).padding.top + 8,
                left: 8,
                right: 8,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      icon: const Icon(Icons.close, color: Colors.white),
                      tooltip: 'Fechar imagem',
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openDownloadUrl(UploadFileInfo file) async {
    setState(() => _downloadingFile = true);
    try {
      final dl = await widget.syncService.fetchDownloadUrl(
        uploadId: _upload.id,
        fileId: file.id,
      );
      if (mounted) {
        final uri = Uri.parse(dl.url);
        if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'Não foi possível abrir a imagem. Tente novamente.',
                ),
              ),
            );
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível baixar o arquivo. Tente novamente.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingFile = false);
    }
  }

  List<(UploadFileInfo, UploadFileInfo?)> _logicalFiles(
    List<UploadFileInfo> files,
  ) {
    final originals = files.where((file) => file.variant == 'original');
    return originals.map((original) {
      UploadFileInfo? preview;
      for (final file in files) {
        if (file.variant == 'preview' && file.imageId == original.imageId) {
          preview = file;
          break;
        }
      }
      return (original, preview);
    }).toList()..sort((a, b) => a.$1.imageId.compareTo(b.$1.imageId));
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yy HH:mm');
    final u = _upload;
    final images = _logicalFiles(u.files);

    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Detalhes do upload',
        subtitle: 'Imagens enviadas para a nuvem',
        actions: [
          if (u.status == 'ready' && images.isNotEmpty)
            CustomAppBarAction(
              child: PopupMenuButton<bool>(
                tooltip: 'Analisar imagens',
                icon: const Icon(Icons.manage_search, color: Colors.white),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: false,
                    child: Text('Analisar todo o upload'),
                  ),
                  PopupMenuItem(
                    value: true,
                    child: Text('Analisar esta imagem'),
                  ),
                ],
                onSelected: (single) => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => InferenceScreen(
                      service: widget.syncService.inference,
                      initialUpload: u,
                      imageId: single
                          ? images[_activeImageIndex].$1.imageId
                          : null,
                    ),
                  ),
                ),
              ),
            ),
          if (_deleting)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            CustomAppBarAction(
              child: IconButton(
                icon: const Icon(Icons.delete_outline, color: Colors.white),
                onPressed: _deleteUpload,
                tooltip: 'Excluir upload na nuvem',
              ),
            ),
        ],
      ),
      body: _refreshing && _error == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (images.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Nenhuma imagem disponível neste upload.',
                      textAlign: TextAlign.center,
                    ),
                  )
                else
                  _imageCarousel(images),
                if (u.errorMessage != null) ...[
                  Text(
                    'Erro: ${u.errorMessage}',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                const SizedBox(height: 12),
                FutureBuilder<_ResolvedCatalogNames>(
                  future: _catalogNamesFuture,
                  builder: (context, snap) {
                    final n = snap.data;
                    final waiting =
                        snap.connectionState == ConnectionState.waiting &&
                        n == null;
                    return _sectionCard(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Sobre o upload',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const Divider(),
                            _metaRow('Fonte', sourceLabel(u.source)),
                            _metaRow(
                              'Enviado em',
                              dateFormat.format(u.createdAt),
                            ),
                            if (waiting)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 8),
                                child: SizedBox(
                                  height: 16,
                                  width: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              )
                            else ...[
                              _metaRow(
                                'Propriedade',
                                n?.propertyName ?? _shortId(u.propertyId),
                              ),
                              _metaRow(
                                'Talhão',
                                n?.talhaoName ?? _shortId(u.talhaoId),
                              ),
                              _metaRow(
                                'Cultura',
                                n?.cropTypeName ?? _shortId(u.cropTypeId),
                              ),
                              if (u.estadioId != null)
                                _metaRow(
                                  'Estádio',
                                  n?.estadioName ?? _shortId(u.estadioId!),
                                ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ],
              ],
            ),
    );
  }

  void _changeImage(int index) {
    if (MediaQuery.disableAnimationsOf(context)) {
      _imagePageController.jumpToPage(index);
      return;
    }
    _imagePageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeInOut,
    );
  }

  Widget _imageCarousel(List<(UploadFileInfo, UploadFileInfo?)> images) {
    final original = images[_activeImageIndex].$1;
    return _sectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) => SizedBox(
              height: (constraints.maxWidth * 3 / 4).clamp(180.0, 280.0),
              child: Stack(
                children: [
                  PageView.builder(
                    controller: _imagePageController,
                    itemCount: images.length,
                    onPageChanged: (index) =>
                        setState(() => _activeImageIndex = index),
                    itemBuilder: (context, index) => _imagePreview(
                      images[index].$2 ?? images[index].$1,
                      index,
                      images.length,
                    ),
                  ),
                  if (images.length > 1) ...[
                    Positioned(
                      left: 4,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: IconButton.filledTonal(
                          onPressed: _activeImageIndex == 0
                              ? null
                              : () => _changeImage(_activeImageIndex - 1),
                          icon: const Icon(Icons.chevron_left),
                          tooltip: 'Imagem anterior',
                        ),
                      ),
                    ),
                    Positioned(
                      right: 4,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: IconButton.filledTonal(
                          onPressed: _activeImageIndex == images.length - 1
                              ? null
                              : () => _changeImage(_activeImageIndex + 1),
                          icon: const Icon(Icons.chevron_right),
                          tooltip: 'Próxima imagem',
                        ),
                      ),
                    ),
                    Positioned(
                      left: 56,
                      right: 56,
                      bottom: 8,
                      child: Center(
                        child: Semantics(
                          label:
                              'Imagem ${_activeImageIndex + 1} de ${images.length}',
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Theme.of(
                                  context,
                                ).colorScheme.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(6),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: List.generate(
                                    images.length,
                                    (index) => Container(
                                      width: 6,
                                      height: 6,
                                      margin: const EdgeInsets.symmetric(
                                        horizontal: 3,
                                      ),
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: index == _activeImageIndex
                                            ? Theme.of(
                                                context,
                                              ).colorScheme.primary
                                            : Theme.of(
                                                context,
                                              ).colorScheme.outlineVariant,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: _imageActions(original),
          ),
        ],
      ),
    );
  }

  Widget _imagePreview(UploadFileInfo file, int index, int imageCount) {
    return FutureBuilder<DownloadUrlResponse>(
      future: _imageUrlFor(file),
      builder: (context, snapshot) {
        final url = snapshot.data?.url;
        final hasUrl = url != null && url.trim().isNotEmpty;
        return Semantics(
          label: 'Ampliar imagem ${index + 1} de $imageCount',
          button: true,
          enabled: hasUrl,
          child: InkWell(
            onTap: hasUrl ? () => _showImageViewer(url, 'Imagem') : null,
            child: ColoredBox(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              child: snapshot.connectionState == ConnectionState.waiting
                  ? const Center(child: CircularProgressIndicator())
                  : !hasUrl || snapshot.hasError
                  ? const Center(child: Text('Imagem indisponível'))
                  : Image.network(
                      url,
                      fit: BoxFit.contain,
                      errorBuilder: (context, error, stackTrace) =>
                          const Center(child: Text('Imagem indisponível')),
                    ),
            ),
          ),
        );
      },
    );
  }

  Widget _imageActions(UploadFileInfo original) {
    final hasLocation = original.latitude != null && original.longitude != null;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (hasLocation)
          OutlinedButton.icon(
            onPressed: () => _openMap(original),
            icon: const Icon(Icons.map_outlined),
            label: const Text('Ver no mapa'),
          )
        else
          const Text('Sem localização'),
        TextButton.icon(
          onPressed: _downloadingFile ? null : () => _openDownloadUrl(original),
          icon: _downloadingFile
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.open_in_new),
          label: const Text('Abrir original'),
        ),
      ],
    );
  }

  Widget _sectionCard({required Widget child}) {
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: child,
    );
  }

  Widget _metaRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
            ),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
