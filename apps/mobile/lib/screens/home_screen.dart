import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/pending_upload.dart';
import '../services/auth_service.dart';
import '../services/database_helper.dart';
import '../services/sync_service.dart';
import '../services/catalog_repository.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_scaffold.dart';
import 'about_screen.dart';
import 'profile_screen.dart';
import 'create_upload_screen.dart';
import 'crop_type_catalog_screen.dart';
import 'property_catalog_screen.dart';
import 'queue_screen.dart';
import '../utils/app_logger.dart';

class HomeScreen extends StatefulWidget {
  final AuthService authService;
  final DatabaseHelper databaseHelper;
  final CatalogRepository catalogRepository;
  final SyncService syncService;

  const HomeScreen({
    super.key,
    required this.authService,
    required this.databaseHelper,
    required this.catalogRepository,
    required this.syncService,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  int _pendingCount = 0;

  @override
  void initState() {
    super.initState();
    _loadUploads();
    _recoverPickerResult();
  }

  Future<void> _recoverPickerResult() async {
    if (!Platform.isAndroid) return;
    try {
      final result = await ImagePicker().retrieveLostData();
      if (!mounted || result.isEmpty) return;
      if (result.exception != null) throw result.exception!;
      final files = result.files;
      if (files != null && files.isNotEmpty) {
        await _createUpload(initialImages: files);
      }
    } catch (error, stack) {
      AppLogger.warning('Image picker recovery failed', error, stack);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível recuperar a foto. Selecione-a novamente.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _createUpload({List<XFile> initialImages = const []}) async {
    final created = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CreateUploadScreen(
          authService: widget.authService,
          databaseHelper: widget.databaseHelper,
          catalogRepository: widget.catalogRepository,
          initialImages: initialImages,
        ),
      ),
    );
    if (created != true || !mounted) return;
    try {
      await widget.syncService.syncPendingCatalogsAndUploads();
    } catch (error, stack) {
      AppLogger.warning('Post-create sync failed', error, stack);
    }
    if (mounted) await _loadUploads();
  }

  Future<void> _loadUploads() async {
    if (mounted) setState(() => _loading = true);
    try {
      final uploads = await widget.databaseHelper.getAllUploads();
      if (!mounted) return;
      setState(() {
        _pendingCount = uploads
            .where(
              (upload) =>
                  upload.status == PendingUploadStatus.pending ||
                  upload.status == PendingUploadStatus.failed,
            )
            .length;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sair'),
        content: const Text('Deseja realmente sair?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Sair'),
          ),
        ],
      ),
    );
    if (confirmed == true) await widget.authService.logout();
  }

  Widget _card(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
    VoidCallback onTap,
    List<Color> colors,
  ) => Container(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      gradient: LinearGradient(colors: colors),
      border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
    ),
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 24, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(
                        context,
                      ).textTheme.titleMedium?.copyWith(color: Colors.white),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final user = widget.authService.currentUser;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: InkWell(
          onTap: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ProfileScreen(authService: widget.authService),
              ),
            );
            if (mounted) setState(() {});
          },
          borderRadius: BorderRadius.circular(24),
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.secondary,
              shape: BoxShape.circle,
              boxShadow: const [
                BoxShadow(
                  color: Colors.black26,
                  blurRadius: 14,
                  spreadRadius: 1,
                  offset: Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(Icons.person, size: 24, color: Colors.white),
          ),
        ),
        title: user?.fullName ?? 'Produtor',
        subtitle: user?.email,
        actions: [
          CustomAppBarAction(
            child: IconButton(
              icon: const Icon(Icons.logout, color: Colors.white),
              onPressed: _confirmLogout,
               tooltip: 'Sair',
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadUploads,
        // Short content must stay scrollable or the pull-to-refresh gesture
        // can never fire.
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: LinearGradient(
                  colors: [
                    Theme.of(context).colorScheme.primary,
                    Theme.of(context).colorScheme.secondary,
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.35),
                    blurRadius: 20,
                    spreadRadius: 1,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.dashboard, color: Colors.white),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Olá, ${user?.fullName ?? 'Produtor'}!',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        Text(
                          'Escolha uma área para continuar.',
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Colors.white.withValues(alpha: 0.9),
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Navegação rápida',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            _card(
              context,
              Icons.cloud_outlined,
              'Uploads',
              _pendingCount > 0
                  ? '$_pendingCount ${_pendingCount == 1 ? 'lote' : 'lotes'} aguardando sincronização.'
                  : 'Ver fila, status e sincronizar imagens.',
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => QueueScreen(
                    databaseHelper: widget.databaseHelper,
                    authService: widget.authService,
                    syncService: widget.syncService,
                    catalogRepository: widget.catalogRepository,
                  ),
                ),
              ),
              const [Color(0xff0b5d9a), Color(0xff1481b8)],
            ),
            const SizedBox(height: 12),
            _card(
              context,
              Icons.add_a_photo_outlined,
              'Novo upload',
              'Criar e preparar um novo envio de imagens',
              _createUpload,
              const [Color(0xff6a4e1a), Color(0xffb17a22)],
            ),
            const SizedBox(height: 12),
            _card(
              context,
              Icons.place_outlined,
              'Propriedades',
              'Gerenciar propriedades e talhões',
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PropertyCatalogScreen(
                    catalogRepository: widget.catalogRepository,
                  ),
                ),
              ),
              const [Color(0xff244a62), Color(0xff2f6f91)],
            ),
            const SizedBox(height: 12),
            _card(
              context,
              Icons.eco_outlined,
              'Culturas',
              'Cadastrar, editar e remover culturas',
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CropTypeCatalogScreen(
                    catalogRepository: widget.catalogRepository,
                  ),
                ),
              ),
              const [Color(0xff1f6249), Color(0xff2d8a67)],
            ),
            const SizedBox(height: 12),
            _card(
              context,
              Icons.info_outline,
              'Sobre',
              'Conheça mais sobre nosso projeto',
              () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AboutScreen()),
              ),
              const [Color(0xff6a3a2a), Color(0xffb8753b)],
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
          ],
        ),
      ),
    );
  }
}
