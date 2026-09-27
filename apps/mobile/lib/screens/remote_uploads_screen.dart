import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/download_url_response.dart';
import '../models/upload_response.dart';
import '../models/catalog.dart';
import '../services/auth_service.dart';
import '../services/sync_service.dart';
import '../services/catalog_repository.dart';
import '../utils/source_labels.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_button.dart';

/// Screen that lists `ready` uploads from the backend via `GET /uploads`.
///
/// Provides pull-to-refresh, status badges, detail navigation, and basic
/// pagination/filter support.
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
  bool _refreshingDetail = false;

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

  Future<void> _refreshUploadDetail(UploadDetail upload) async {
    setState(() => _refreshingDetail = true);
    try {
      final refreshed = await widget.syncService.fetchRemoteUploadDetail(
        upload.id,
      );
      if (mounted) {
        setState(() {
          final index = _uploads.indexWhere((u) => u.id == upload.id);
          if (index >= 0) {
            _uploads[index] = refreshed;
          }
          _refreshingDetail = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _refreshingDetail = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Não foi possível atualizar. Tente novamente.'),
          ),
        );
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
          if (_refreshingDetail)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
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
        itemCount: _uploads.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, index) {
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

          final upload = _uploads[index];
          return _UploadListTile(
            upload: upload,
            syncService: widget.syncService,
            catalogRepository: widget.catalogRepository,
            previewFuture: _previewFutureFor(upload),
            onRetryPreview: () => _retryPreview(upload.id),
            onRefreshDetail: () => _refreshUploadDetail(upload),
            onRefreshList: () => _loadUploads(refresh: true),
          );
        },
      ),
    );
  }
}

/// A single upload tile in the remote list.
class _UploadListTile extends StatelessWidget {
  final UploadDetail upload;
  final SyncService syncService;
  final CatalogRepository catalogRepository;
  final Future<DownloadUrlResponse>? previewFuture;
  final VoidCallback onRetryPreview;
  final VoidCallback onRefreshDetail;
  final Future<void> Function() onRefreshList;

  const _UploadListTile({
    required this.upload,
    required this.syncService,
    required this.catalogRepository,
    required this.previewFuture,
    required this.onRetryPreview,
    required this.onRefreshDetail,
    required this.onRefreshList,
  });

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yy HH:mm');
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: ListTile(
        leading: _PreviewThumbnail(
          future: previewFuture,
          onRetry: onRetryPreview,
        ),
        title: Text(
          '${upload.id.substring(0, 12)}...',
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Status: ${_statusLabel(upload.status)}'),
            Text('Fonte: ${sourceLabel(upload.source)}'),
            Text('Criado: ${dateFormat.format(upload.createdAt)}'),
            if (upload.activityDate != upload.createdAt)
              Text('Atividade: ${dateFormat.format(upload.activityDate)}'),
            Text('Arquivos: ${upload.fileCount}'),
            if (upload.previewCount > 0)
              Text('Pré-visualizações: ${upload.previewCount}'),

            if (upload.errorMessage != null)
              Text(
                'Erro: ${upload.errorMessage}',
                style: const TextStyle(color: Colors.red),
              ),
          ],
        ),
        isThreeLine: true,
        trailing: IconButton(
          icon: const Icon(Icons.refresh, size: 20),
          onPressed: onRefreshDetail,
          tooltip: 'Atualizar status',
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
        ),
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
      ),
    );
  }

  String _statusLabel(String status) => _statusInfo(status).label;

  _RemoteStatusInfo _statusInfo(String status) {
    switch (status) {
      case 'ready':
        return const _RemoteStatusInfo(
          'Pronto',
          Icons.check_circle,
          Colors.green,
        );
      case 'finalizing':
        return const _RemoteStatusInfo(
          'Finalizando',
          Icons.autorenew,
          Colors.blue,
        );
      case 'draft':
        return const _RemoteStatusInfo('Rascunho', Icons.edit, Colors.grey);
      case 'failed':
        return const _RemoteStatusInfo('Falhou', Icons.error, Colors.red);
      default:
        return const _RemoteStatusInfo(
          'Desconhecido',
          Icons.help_outline,
          Colors.grey,
        );
    }
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

class _RemoteStatusInfo {
  final String label;
  final IconData icon;
  final Color color;

  const _RemoteStatusInfo(this.label, this.icon, this.color);
}

/// 60×60 thumbnail for a remote upload's preview image.
class _PreviewThumbnail extends StatelessWidget {
  final Future<DownloadUrlResponse>? future;
  final VoidCallback onRetry;

  const _PreviewThumbnail({required this.future, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 60,
        height: 60,
        child: FutureBuilder<DownloadUrlResponse>(
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
            if (snapshot.hasError || url == null || url.trim().isEmpty) {
              return InkWell(
                onTap: onRetry,
                child: Container(
                  color: Colors.grey.shade200,
                  child: Icon(
                    Icons.broken_image_outlined,
                    color: Colors.grey.shade500,
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
        ),
      ),
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
  final Map<String, Future<DownloadUrlResponse>> _previewUrlFutures = {};
  Future<_ResolvedCatalogNames>? _catalogNamesFuture;

  @override
  void initState() {
    super.initState();
    _upload = widget.upload;
    _catalogNamesFuture = _resolveCatalogNames(_upload);
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _refreshing = true;
      _error = null;
    });
    try {
      final refreshed = await widget.syncService.fetchRemoteUploadDetail(
        _upload.id,
      );
      if (mounted) {
        setState(() {
          _upload = refreshed;
          _previewUrlFutures.clear();
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Excluir upload na nuvem?'),
        content: const Text(
          'Isso remove o upload do servidor e atualiza a lista. A limpeza local da fila é feita separadamente no aparelho.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Excluir na nuvem'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

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

  Future<DownloadUrlResponse> _previewUrlFor(UploadFileInfo file) {
    return _previewUrlFutures.putIfAbsent(
      file.id,
      () => widget.syncService.fetchPreviewUrl(
        uploadId: _upload.id,
        fileId: file.id,
      ),
    );
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
                    Text(
                      title,
                      style: const TextStyle(color: Colors.white, fontSize: 16),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      icon: const Icon(Icons.close, color: Colors.white),
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
              SnackBar(
                content: Text(
                  'Não foi possível abrir a URL de ${file.variant} #${file.imageIndex}',
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
        if (file.variant == 'preview' &&
            file.imageIndex == original.imageIndex) {
          preview = file;
          break;
        }
      }
      return (original, preview);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yy HH:mm');
    final u = _upload;

    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Detalhes do upload',
        subtitle: 'Informações e arquivos enviados',
        actions: [
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
          if (_refreshing)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          CustomAppBarAction(
            child: IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _refreshing ? null : _refresh,
              tooltip: 'Atualizar',
            ),
          ),
        ],
      ),
      body: _refreshing && _error == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Cartão de status
                _sectionCard(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Status: ',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            _statusBadge(u.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('Arquivos: ${u.fileCount}'),
                        if (u.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Erro: ${u.errorMessage}',
                            style: const TextStyle(color: Colors.red),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Cartão de metadados
                _sectionCard(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Detalhes do upload',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const Divider(),
                        _metaRow('ID do upload', u.id),
                        _metaRow('Fonte', sourceLabel(u.source)),
                        _metaRow('Criado', dateFormat.format(u.createdAt)),
                        _metaRow('Atualizado', dateFormat.format(u.updatedAt)),
                        _metaRow(
                          'Data da atividade',
                          dateFormat.format(u.activityDate),
                        ),
                        _metaRow('Latitude', u.latitude.toStringAsFixed(6)),
                        _metaRow('Longitude', u.longitude.toStringAsFixed(6)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Cartão de referências do catálogo (nomes resolvidos localmente)
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
                              'Referências do catálogo',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const Divider(),
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
                const SizedBox(height: 12),

                // Cartão de arquivos
                _sectionCard(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Arquivos (${u.fileCount})',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const Divider(),
                        ..._logicalFiles(u.files).map((entry) {
                          final original = entry.$1;
                          final preview = entry.$2;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                FutureBuilder<DownloadUrlResponse>(
                                  future: preview == null
                                      ? null
                                      : _previewUrlFor(preview),
                                  builder: (context, snapshot) {
                                    final url = snapshot.data?.url;
                                    return InkWell(
                                      onTap: url == null
                                          ? null
                                          : () => _showImageViewer(
                                              url,
                                              'Imagem #${original.imageIndex}',
                                            ),
                                      child: Container(
                                        width: 72,
                                        height: 72,
                                        decoration: BoxDecoration(
                                          color: Colors.grey.shade200,
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                        ),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                          child:
                                              snapshot.connectionState ==
                                                  ConnectionState.waiting
                                              ? const Center(
                                                  child: SizedBox(
                                                    width: 20,
                                                    height: 20,
                                                    child:
                                                        CircularProgressIndicator(
                                                          strokeWidth: 2,
                                                        ),
                                                  ),
                                                )
                                              : snapshot.hasError || url == null
                                              ? const Center(
                                                  child: Icon(
                                                    Icons.broken_image,
                                                  ),
                                                )
                                              : Image.network(
                                                  url,
                                                  fit: BoxFit.cover,
                                                  errorBuilder:
                                                      (
                                                        context,
                                                        error,
                                                        stackTrace,
                                                      ) => const Center(
                                                        child: Icon(
                                                          Icons.broken_image,
                                                        ),
                                                      ),
                                                ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Imagem #${original.imageIndex}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      Text(
                                        'Tipo: ${original.contentType}',
                                        style: Theme.of(
                                          context,
                                        ).textTheme.bodySmall,
                                      ),
                                      if (original.sizeBytes != null)
                                        Text(
                                          'Tamanho: ${_formatBytes(original.sizeBytes!)}',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.bodySmall,
                                        ),
                                      if (original.objectKey != null)
                                        Text(
                                          'Chave: ${original.objectKey}',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.bodySmall,
                                        ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: _downloadingFile
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.open_in_new, size: 20),
                                  onPressed: _downloadingFile
                                      ? null
                                      : () => _openDownloadUrl(original),
                                   tooltip: 'Abrir ou baixar',
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(
                                    minWidth: 36,
                                    minHeight: 36,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ],
              ],
            ),
    );
  }

  Widget _sectionCard({required Widget child}) {
    return Card(
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

  Widget _statusBadge(String status) {
    final info = _statusInfo(status);
    final color = info.color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(info.icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            info.label,
            style: TextStyle(color: color, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  _RemoteStatusInfo _statusInfo(String status) {
    switch (status) {
      case 'ready':
        return const _RemoteStatusInfo(
          'Pronto',
          Icons.check_circle,
          Colors.green,
        );
      case 'finalizing':
        return const _RemoteStatusInfo(
          'Finalizando',
          Icons.autorenew,
          Colors.blue,
        );
      case 'draft':
        return const _RemoteStatusInfo('Rascunho', Icons.edit, Colors.grey);
      case 'failed':
        return const _RemoteStatusInfo('Falhou', Icons.error, Colors.red);
      default:
        return const _RemoteStatusInfo(
          'Desconhecido',
          Icons.help_outline,
          Colors.grey,
        );
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
