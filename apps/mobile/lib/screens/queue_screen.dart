import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/pending_upload.dart';
import '../services/database_helper.dart';
import '../services/auth_service.dart';
import '../services/sync_service.dart';
import '../services/catalog_repository.dart';
import '../utils/app_logger.dart';
import '../utils/source_labels.dart';
import 'remote_uploads_screen.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/stat_item.dart';

class QueueScreen extends StatefulWidget {
  final DatabaseHelper databaseHelper;
  final AuthService authService;
  final SyncService syncService;
  final CatalogRepository catalogRepository;

  const QueueScreen({
    super.key,
    required this.databaseHelper,
    required this.authService,
    required this.syncService,
    required this.catalogRepository,
  });

  @override
  State<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends State<QueueScreen> {
  late Future<List<PendingUpload>> _uploadsFuture;
  bool _cleaningUp = false;
  bool _syncing = false;
  String? _retryingUploadId;
  int _pendingCount = 0;
  // Optimistic default; the first connectivity emission (always sent by
  // ConnectivityMonitor on start) corrects it when offline.
  bool _isConnected = true;
  StreamSubscription<bool>? _connectionSubscription;
  StreamSubscription<void>? _dbSubscription;

  @override
  void initState() {
    super.initState();
    _uploadsFuture = widget.databaseHelper.getAllUploads().then((uploads) {
      if (mounted) {
        setState(() {
          _pendingCount =
              _count(uploads, PendingUploadStatus.pending) +
              _count(uploads, PendingUploadStatus.failed);
        });
      }
      return uploads;
    });
    _dbSubscription = widget.databaseHelper.changes.listen((_) {
      if (mounted && !_syncing) {
        _reload();
      }
    });
    _connectionSubscription = widget.syncService.connectionStatus.listen((
      connected,
    ) {
      if (!mounted) return;
      setState(() => _isConnected = connected);
      if (connected) {
        ScaffoldMessenger.of(context).removeCurrentSnackBar();
      } else {
        _showOfflineSnackBar();
      }
    });
  }

  @override
  void dispose() {
    _dbSubscription?.cancel();
    _connectionSubscription?.cancel();
    super.dispose();
  }

  void _showOfflineSnackBar() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Row(
          children: [
            Icon(Icons.cloud_off, color: Colors.white),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                 'Sem conexão. Os uploads serão enviados quando a conexão for restabelecida.',
              ),
            ),
          ],
        ),
        backgroundColor: Colors.orange,
        duration: Duration(days: 1),
      ),
    );
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      final result = await widget.syncService.syncPendingCatalogsAndUploads();
      if (!mounted || result == null) return;
      if (result.successful > 0) {
        _showSnackBar(result.message, Colors.green);
      } else if (result.failed > 0) {
        _showSnackBar(result.message, Colors.red);
      }
      await _reload();
    } catch (e) {
      if (mounted) {
        _showSnackBar(
          'Não foi possível sincronizar. Verifique a conexão e tente novamente.',
          Colors.red,
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _showSnackBar(String message, Color color) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  Future<void> _reload() async {
    final uploads = await widget.databaseHelper.getAllUploads();
    if (!mounted) return;
    final pendingCount = _count(uploads, PendingUploadStatus.pending);
    final failedCount = _count(uploads, PendingUploadStatus.failed);
    setState(() {
      _uploadsFuture = Future.value(uploads);
      _pendingCount = pendingCount + failedCount;
    });
  }

  /// Delete completed uploads from the local queue and their pending image files.
  /// Only removes local rows with status == completed.
  Future<void> _cleanupCompleted() async {
    setState(() => _cleaningUp = true);
    try {
      final all = await widget.databaseHelper.getAllUploads();
      final completed = all
          .where((u) => u.status == PendingUploadStatus.completed)
          .toList();

      int deletedCount = 0;
      for (final upload in completed) {
        // Remove local image files if they still exist
        try {
          for (final path in upload.paths) {
            final file = File(path);
            if (await file.exists()) {
              await file.delete();
            }
          }
        } catch (error, stack) {
          // File cleanup is best-effort; continue even if some fail
          AppLogger.warning(
            'Queue cleanup: failed to delete images of ${upload.id}',
            error,
            stack,
          );
        }

        // Delete the SQLite row
        await widget.databaseHelper.deleteUpload(upload.id);
        deletedCount++;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Fila local limpa: $deletedCount ${deletedCount == 1 ? 'lote concluído' : 'lotes concluídos'}.',
            ),
          ),
        );
        await _reload();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Não foi possível limpar a fila. Tente novamente.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _cleaningUp = false);
    }
  }

  Future<void> _deleteUpload(PendingUpload upload) async {
    var checked = false;
    final deleteCloud = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: const Text('Excluir lote'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Deseja excluir este lote?'),
                if (upload.backendUploadId != null) ...[
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: checked,
                    onChanged: (value) =>
                        setDialogState(() => checked = value ?? false),
                    title: const Text('Também excluir da nuvem'),
                    subtitle: const Text('Remove as cópias online do lote.'),
                  ),
                ] else
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'As imagens e os dados locais serão removidos.',
                    ),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancelar'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, checked),
                child: const Text('Excluir'),
              ),
            ],
          );
        },
      ),
    );
    if (deleteCloud == null) return;
    try {
      await widget.syncService.deleteQueuedUpload(
        upload,
        deleteRemote: deleteCloud,
      );
      if (mounted) await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Não foi possível excluir o lote. Tente novamente.'),
          ),
        );
      }
    }
  }

  Widget _infoRow(BuildContext context, IconData icon, String text) =>
      Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(text)),
          ],
        ),
      );

  void _showDetails(PendingUpload upload) {
    final paths = upload.paths;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.of(sheetContext).size.height * .85,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Text(
                    'Detalhes do Envio',
                    style: Theme.of(sheetContext).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 10),
                _infoRow(
                  sheetContext,
                  Icons.access_time,
                  'Data: ${_relativeDate(upload.activityDate)}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.collections_outlined,
                  'Imagens: ${paths.length}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.devices_outlined,
                  'Origem: ${sourceLabel(upload.source)}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.grid_view_outlined,
                  'Talhão: ${upload.talhaoId ?? '-'}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.eco_outlined,
                  'Cultura: ${upload.cropTypeId ?? '-'}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.timeline,
                  'Estádio: ${upload.estadioId ?? '-'}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  Icons.location_on,
                  'GPS: ${upload.latitude.toStringAsFixed(5)}, ${upload.longitude.toStringAsFixed(5)}',
                ),
                const SizedBox(height: 8),
                _infoRow(
                  sheetContext,
                  _statusInfo(upload.status).icon,
                  'Status: ${_statusLabel(upload.status)}',
                ),
                if (upload.backendStatus != null) ...[
                  const SizedBox(height: 8),
                  _infoRow(
                    sheetContext,
                    Icons.cloud_outlined,
                    'Status do backend: ${upload.backendStatus}',
                  ),
                ],
                if (upload.backendUploadId != null) ...[
                  const SizedBox(height: 8),
                  _infoRow(
                    sheetContext,
                    Icons.tag,
                    'ID do envio: ${upload.backendUploadId}',
                  ),
                ],
                if (upload.errorMessage != null &&
                    upload.errorMessage!.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _infoRow(
                    sheetContext,
                    Icons.error_outline,
                    'Erro: ${upload.errorMessage}',
                  ),
                ],
                if (upload.backendError != null &&
                    upload.backendError!.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _infoRow(
                    sheetContext,
                    Icons.cloud_off,
                    'Erro do backend: ${upload.backendError}',
                  ),
                ],
                const SizedBox(height: 14),
                Center(
                  child: Text(
                    'Imagens do lote',
                    style: Theme.of(sheetContext).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Theme.of(sheetContext)
                          .colorScheme
                          .surfaceContainerHighest
                          .withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: Theme.of(
                          sheetContext,
                        ).colorScheme.outline.withValues(alpha: 0.18),
                      ),
                    ),
                    child: GridView.builder(
                      itemCount: paths.length,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                          ),
                      itemBuilder: (_, index) => Material(
                        borderRadius: BorderRadius.circular(12),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _showFullscreen(paths[index]),
                          child: Image.file(
                            File(paths[index]),
                            fit: BoxFit.cover,
                            // Grid cell is ~1/3 of a phone width; decode at 2x.
                            cacheWidth: 480,
                            errorBuilder: (_, _, _) => Container(
                              color: Colors.grey[300],
                              child: Icon(
                                Icons.broken_image,
                                color: Colors.grey[500],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showFullscreen(String path) {
    showDialog(
      context: context,
      barrierColor: Colors.black,
      builder: (dialogContext) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                minScale: 1,
                maxScale: 4,
                child: Image.file(
                  File(path),
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) =>
                      const Icon(Icons.broken_image, color: Colors.white),
                ),
              ),
            ),
            Positioned(
              top: 40,
              right: 16,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
                onPressed: () => Navigator.pop(dialogContext),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _retryUpload(PendingUpload upload) async {
    setState(() => _retryingUploadId = upload.id);
    try {
      await widget.syncService.retryUpload(upload);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Nova tentativa iniciada para ${upload.id.substring(0, 12)}...',
            ),
          ),
        );
        await _reload();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível tentar novamente. Verifique a conexão.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _retryingUploadId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authService.currentUser;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: 'Uploads',
        subtitle: user?.email,
        actions: [
          CustomAppBarAction(
            child: Badge(
              isLabelVisible: !_syncing && _pendingCount > 0,
              label: Text('$_pendingCount'),
              child: IconButton(
                tooltip: 'Sincronizar',
                onPressed: _syncing || !_isConnected ? null : _sync,
                icon: _syncing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.sync, color: Colors.white),
              ),
            ),
          ),
          CustomAppBarAction(
            child: PopupMenuButton<String>(
              tooltip: 'Mais opções',
              icon: const Icon(Icons.more_vert, color: Colors.white),
              onSelected: (value) {
                if (value == 'cleanup') _cleanupCompleted();
                if (value == 'refresh') _reload();
                if (value == 'remote') {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => RemoteUploadsScreen(
                        authService: widget.authService,
                        syncService: widget.syncService,
                        catalogRepository: widget.catalogRepository,
                      ),
                    ),
                  );
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'cleanup',
                  enabled: !_cleaningUp,
                  child: Row(
                    children: [
                      const Icon(Icons.cleaning_services),
                      const SizedBox(width: 12),
                      Text(_cleaningUp ? 'Limpando...' : 'Limpar concluídos'),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'refresh',
                  child: Row(
                    children: [
                      Icon(Icons.refresh),
                      SizedBox(width: 12),
                      Text('Atualizar'),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'remote',
                  child: Row(
                    children: [
                      Icon(Icons.cloud),
                      SizedBox(width: 12),
                      Text('Uploads remotos'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: FutureBuilder<List<PendingUpload>>(
        future: _uploadsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final uploads = snapshot.data ?? const <PendingUpload>[];
          if (uploads.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.cloud_upload_outlined,
                    size: 80,
                    color: Colors.grey,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Nenhum upload ainda',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                  SizedBox(height: 8),
                  Text('Seus uploads aparecerão aqui.'),
                ],
              ),
            );
          }

          final completedCount = _count(uploads, PendingUploadStatus.completed);
          final failedCount = _count(uploads, PendingUploadStatus.failed);
          final retryLimitCount = uploads
              .where(
                (u) =>
                    u.status == PendingUploadStatus.failed &&
                    u.syncAttemptCount >= DatabaseHelper.maxAutomaticSyncAttempts,
              )
              .length;
          final uploadingCount =
              _count(uploads, PendingUploadStatus.uploading) +
              _count(uploads, PendingUploadStatus.pendingMetadataSync);
          final pendingCount = _count(uploads, PendingUploadStatus.pending);
          return Column(
            children: [
              _statsRow(
                pendingCount: pendingCount,
                uploadingCount: uploadingCount,
                completedCount: completedCount,
                failedCount: failedCount,
              ),
              if (retryLimitCount > 0)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  color: Colors.red.shade50,
                  child: Text(
                    '$retryLimitCount ${retryLimitCount == 1 ? 'lote atingiu' : 'lotes atingiram'} o limite de tentativas. Toque em “Tentar novamente”.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.red.shade800,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              if (completedCount > 0)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  color: Colors.green.shade50,
                  child: Text(
                    '$completedCount ${completedCount == 1 ? 'lote concluído' : 'lotes concluídos'} — use a limpeza local para removê-los da fila.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.green.shade800,
                    ),
                  ),
                ),
              Expanded(child: _uploadList(uploads)),
            ],
          );
        },
      ),
    );
  }

  int _count(List<PendingUpload> uploads, PendingUploadStatus status) =>
      uploads.where((upload) => upload.status == status).length;

  Widget _statsRow({
    required int pendingCount,
    required int uploadingCount,
    required int completedCount,
    required int failedCount,
  }) => Container(
    margin: const EdgeInsets.all(16),
    padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      gradient: LinearGradient(
        colors: [
          Theme.of(context).colorScheme.primary,
          Theme.of(context).colorScheme.secondary,
        ],
      ),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: [
        Expanded(
          child: StatItem(
            icon: Icons.schedule,
            value: '$pendingCount',
            label: 'Pendentes',
            color: Colors.orange,
          ),
        ),
        _statSeparator(),
        Expanded(
          child: StatItem(
            icon: Icons.cloud_upload,
            value: '$uploadingCount',
            label: 'Enviando',
            color: Colors.blue,
          ),
        ),
        _statSeparator(),
        Expanded(
          child: StatItem(
            icon: Icons.check_circle,
            value: '$completedCount',
            label: 'Concluídos',
            color: Colors.green.shade400,
          ),
        ),
        _statSeparator(),
        Expanded(
          child: StatItem(
            icon: Icons.error,
            value: '$failedCount',
            label: 'Falhas',
            color: Colors.red,
          ),
        ),
      ],
    ),
  );

  Widget _statSeparator() =>
      Container(height: 70, width: 1, color: Colors.white24);

  Widget _uploadList(List<PendingUpload> uploads) => ListView.builder(
    itemCount: uploads.length,
    itemBuilder: (context, index) {
      final upload = uploads[index];
      final paths = upload.paths;
      final preview = paths.isEmpty ? null : File(paths.first);
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ListTile(
          onTap: () => _showDetails(upload),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 4,
          ),
          leading: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 60,
              height: 60,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // No existsSync() probe here: decoding is async anyway and
                  // errorBuilder covers missing files without per-row disk IO.
                  if (preview != null)
                    Image.file(
                      preview,
                      fit: BoxFit.cover,
                      cacheWidth: 180,
                      errorBuilder: (_, _, _) => Container(
                        color: Colors.grey[300],
                        child: Icon(
                          Icons.broken_image,
                          size: 40,
                          color: Colors.grey[500],
                        ),
                      ),
                    )
                  else
                    Container(
                      color: Colors.grey[300],
                      child: Icon(
                        Icons.broken_image,
                        size: 40,
                        color: Colors.grey[500],
                      ),
                    ),
                  if (paths.length > 1)
                    Positioned(
                      right: 4,
                      bottom: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.75),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${paths.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          title: Row(
            children: [
              Icon(Icons.access_time, size: 14, color: Colors.grey[600]),
              const SizedBox(width: 6),
              Text(
                _relativeDate(upload.activityDate),
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[700],
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              children: [
                Icon(
                  Icons.collections_outlined,
                  size: 14,
                  color: Colors.grey[700],
                ),
                const SizedBox(width: 6),
                Text(
                  '${paths.length} ${paths.length == 1 ? 'imagem' : 'imagens'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[700],
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (upload.status == PendingUploadStatus.failed)
                IconButton(
                  tooltip: 'Tentar novamente',
                  onPressed: _retryingUploadId == upload.id
                      ? null
                      : () => _retryUpload(upload),
                  icon: _retryingUploadId == upload.id
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          Icons.refresh,
                          color: _statusInfo(upload.status).color,
                        ),
                ),
              Icon(
                _statusInfo(upload.status).icon,
                color: _statusInfo(upload.status).color,
              ),
              IconButton(
                tooltip: 'Excluir lote',
                icon: const Icon(
                  Icons.delete_outline,
                  color: Colors.red,
                  size: 20,
                ),
                onPressed: widget.syncService.isUploadActive(upload.id)
                    ? null
                    : () => _deleteUpload(upload),
                // Keep the default 48dp min tap target for this destructive
                // action; zeroed constraints made it hard to hit.
              ),
            ],
          ),
        ),
      );
    },
  );

  String _relativeDate(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    final time = '${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    final days = today.difference(day).inDays;
    if (days == 0) return 'Hoje às $time';
    if (days == 1) return 'Ontem às $time';
    return DateFormat('dd/MM/yyyy').format(date);
  }

  String _statusLabel(PendingUploadStatus status) => _statusInfo(status).label;

  _QueueStatusInfo _statusInfo(PendingUploadStatus status) {
    switch (status) {
      case PendingUploadStatus.pending:
        return const _QueueStatusInfo('Pendente', Icons.schedule, Colors.grey);
      case PendingUploadStatus.uploading:
        return const _QueueStatusInfo(
          'Enviando',
          Icons.cloud_upload,
          Colors.blue,
        );
      case PendingUploadStatus.pendingMetadataSync:
        return const _QueueStatusInfo(
          'Sincronizando',
          Icons.sync,
          Colors.orange,
        );
      case PendingUploadStatus.completed:
        return const _QueueStatusInfo(
          'Concluído',
          Icons.check_circle,
          Colors.green,
        );
      case PendingUploadStatus.failed:
        return const _QueueStatusInfo('Falhou', Icons.error, Colors.red);
    }
  }
}

class _QueueStatusInfo {
  final String label;
  final IconData icon;
  final Color color;

  const _QueueStatusInfo(this.label, this.icon, this.color);
}
