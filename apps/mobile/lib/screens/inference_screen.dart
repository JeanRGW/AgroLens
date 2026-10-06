import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../models/inference.dart';
import '../models/upload_response.dart';
import '../services/inference_service.dart';
import '../utils/inference_thumbnail.dart';
import '../widgets/custom_scaffold.dart';
import '../widgets/custom_app_bar.dart';
import 'inference_viewer_screen.dart';

class InferenceScreen extends StatefulWidget {
  final InferenceService service;
  final UploadDetail? initialUpload;
  final String? imageId;
  const InferenceScreen({
    super.key,
    required this.service,
    this.initialUpload,
    this.imageId,
  });
  @override
  State<InferenceScreen> createState() => _InferenceScreenState();
}

class _SelectedImage {
  final XFile file;
  final int sizeBytes;
  final Uint8List? thumbnail;
  final bool camera;
  _SelectedImage(
    this.file,
    this.sizeBytes,
    this.thumbnail, {
    this.camera = false,
  });
  String label(int index) => camera ? 'Foto ${index + 1}' : file.name;
}

class _InferenceScreenState extends State<InferenceScreen>
    with WidgetsBindingObserver {
  static const _secondaryTextStyle = TextStyle(
    fontSize: 13,
    color: Color(0xff53624c),
  );
  static final _sourceButtonStyle = OutlinedButton.styleFrom(
    foregroundColor: const Color(0xff245d38),
    side: const BorderSide(color: Color(0xff83917d)),
    minimumSize: const Size(0, 48),
    visualDensity: VisualDensity.standard,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  );
  static final _textButtonStyle = TextButton.styleFrom(
    foregroundColor: const Color(0xff245d38),
    minimumSize: const Size(0, 48),
    visualDensity: VisualDensity.standard,
  );
  List<InferenceModel> _models = [];
  List<InferenceJob> _jobs = [];
  final List<_SelectedImage> _files = [];
  String? _modelId, _modelError, _jobsError, _error;
  UploadDetail? _upload;
  Future<String?>? _cover;
  bool _device = true,
      _modelsLoading = true,
      _jobsLoading = false,
      _jobsRefreshing = false,
      _submitting = false,
      _picking = false;
  int _tab = 0, _offset = 0, _total = 0;
  String _stage = '';
  Map<String, String> _propertyNames = {};
  bool _foreground = true;
  Timer? _poll;
  int get _count => _device
      ? _files.length
      : _upload == null
      ? 0
      : _upload!.id == widget.initialUpload?.id && widget.imageId != null
      ? 1
      : _upload!.fileCount;
  bool get _canSubmit =>
      _modelId != null && _count > 0 && !_submitting && !_picking;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _upload = widget.initialUpload;
    _device = _upload == null;
    if (_upload != null) _cover = widget.service.cover(_upload!);
    _loadModels();
    _loadJobs();
    unawaited(_loadPropertyNames());
  }

  Future<void> _loadPropertyNames() async {
    try {
      final names = await widget.service.propertyNames();
      if (mounted) setState(() => _propertyNames = names);
    } catch (_) {
      /* Dates remain usable when catalog names are unavailable. */
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _poll?.cancel();
    if (state == AppLifecycleState.resumed && _tab == 1) _loadJobs();
  }

  Future<void> _loadModels() async {
    setState(() {
      _modelsLoading = true;
      _modelError = null;
    });
    try {
      final models = await widget.service.models();
      if (!mounted) return;
      setState(() {
        _models = models;
        if (models.length == 1) _modelId = models.single.id;
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _modelError =
              'Não foi possível carregar modelos. Verifique a conexão.',
        );
      }
    } finally {
      if (mounted) setState(() => _modelsLoading = false);
    }
  }

  Future<void> _loadJobs({bool background = false}) async {
    if (_jobsLoading) return;
    _poll?.cancel();
    setState(() {
      _jobsLoading = true;
      _jobsRefreshing = !background;
      _jobsError = null;
    });
    try {
      var response = await widget.service.history(_offset);
      if (!mounted) return;
      final total = response['total'] as int;
      if (_offset >= total && _offset > 0) {
        _offset = total == 0 ? 0 : ((total - 1) ~/ 20) * 20;
        response = await widget.service.history(_offset);
      }
      if (!mounted) return;
      setState(() {
        _total = response['total'] as int;
        _jobs = (response['jobs'] as List)
            .map((e) => InferenceJob.fromJson(e as Json))
            .toList();
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _jobsError =
              'Não foi possível carregar o histórico. Tente atualizar.',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _jobsLoading = false;
          _jobsRefreshing = false;
        });
        if (_foreground && _tab == 1 && _jobs.any((job) => job.active)) {
          _poll = Timer.periodic(const Duration(seconds: 5), (_) {
            if (mounted && ModalRoute.of(context)?.isCurrent == true) {
              _loadJobs(background: true);
            }
          });
        }
      }
    }
  }

  Future<void> _pick({bool camera = false}) async {
    setState(() {
      _picking = true;
      _error = null;
    });
    try {
      final picker = ImagePicker();
      final List<XFile> picked;
      if (camera) {
        final photo = await picker.pickImage(source: ImageSource.camera);
        picked = photo == null ? [] : [photo];
      } else {
        picked = await picker.pickMultiImage();
      }
      if (!mounted || picked.isEmpty) return;
      final additions = <_SelectedImage>[];
      for (final file in picked) {
        final size = await file.length();
        if (_files.any(
              (f) => f.file.name == file.name && f.sizeBytes == size,
            ) ||
            additions.any(
              (f) => f.file.name == file.name && f.sizeBytes == size,
            )) {
          continue;
        }
        await validateInferenceFiles([file]);
        if (_files.length + additions.length >= 20) {
          throw const FormatException('Máximo de 20 imagens.');
        }
        if (!mounted) return;
        final thumbnail = await inferenceThumbnail(file);
        if (!mounted) return;
        additions.add(_SelectedImage(file, size, thumbnail, camera: camera));
      }
      if (mounted) {
        setState(() {
          _files.addAll(additions);
          _device = true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is FormatException
              ? e.message
              : camera
              ? 'Não foi possível tirar a foto. Verifique a permissão da câmera e tente novamente.'
              : 'Não foi possível selecionar imagens. Tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _chooseUpload() async {
    final upload = await Navigator.push<UploadDetail>(
      context,
      MaterialPageRoute(builder: (_) => _UploadPicker(service: widget.service)),
    );
    if (!mounted || upload == null) return;
    setState(() {
      _upload = upload;
      _cover = widget.service.cover(upload);
      _device = false;
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final id = await widget.service.submit(
        modelId: _modelId!,
        upload: _device ? null : _upload,
        imageId: !_device && _upload?.id == widget.initialUpload?.id
            ? widget.imageId
            : null,
        files: _files.map((f) => f.file).toList(),
        stage: (stage) {
          if (mounted) setState(() => _stage = stage);
        },
      );
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              InferenceViewerScreen(service: widget.service, jobId: id),
        ),
      );
      if (mounted) await _loadJobs();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível iniciar a inferência. Verifique a conexão e tente novamente.',
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _open(InferenceJob job) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            InferenceViewerScreen(service: widget.service, jobId: job.id),
      ),
    );
    if (mounted) await _loadJobs();
  }

  Future<void> _delete(InferenceJob job) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir execução?'),
        content: const Text('Os resultados desta execução serão removidos.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.service.delete(job.id);
      if (mounted) await _loadJobs();
    } catch (_) {
      if (mounted) {
        setState(
          () => _jobsError = 'Não foi possível excluir. Tente novamente.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_submitting,
    child: CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(
          context,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: 'Inferência',
        subtitle: 'Analise suas imagens',
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: SegmentedButton<int>(
              showSelectedIcon: false,
              style: SegmentedButton.styleFrom(
                side: const BorderSide(color: Color(0xffcdd8c8)),
                minimumSize: const Size(0, 48),
                visualDensity: VisualDensity.standard,
                tapTargetSize: MaterialTapTargetSize.padded,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
              ),
              segments: const [
                ButtonSegment(value: 0, label: Text('Nova inferência')),
                ButtonSegment(value: 1, label: Text('Histórico')),
              ],
              selected: {_tab},
              onSelectionChanged: _submitting
                  ? null
                  : (value) {
                      setState(() => _tab = value.first);
                      _poll?.cancel();
                      if (_tab == 1) _loadJobs();
                    },
            ),
          ),
          Expanded(child: _tab == 0 ? _setup() : _history()),
        ],
      ),
    ),
  );
  Widget _panel(String title, Widget child, {Widget? trailing}) => Card(
    elevation: 0,
    shape: RoundedRectangleBorder(
      side: const BorderSide(color: Color(0xffcdd8c8)),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 12), trailing],
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );
  Widget _setup() {
    final model = _models.where((m) => m.id == _modelId).firstOrNull;
    final modelPanel = _panel(
      'Modelo',
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_modelsLoading)
            const LinearProgressIndicator()
          else if (_modelError != null)
            Text(_modelError!)
          else if (_models.isEmpty)
            const Text(
              'Nenhum modelo ativo. Peça a um administrador para ativar um modelo.',
            )
          else
            DropdownButtonFormField<String>(
              initialValue: _modelId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Modelo de detecção',
                border: OutlineInputBorder(),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Color(0xff83917d)),
                ),
              ),
              items: _models
                  .map(
                    (m) => DropdownMenuItem(
                      value: m.id,
                      child: Text(m.name, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (id) => setState(() => _modelId = id),
            ),
          if (!_modelsLoading && (_modelError != null || _models.isEmpty))
            TextButton(
              onPressed: _loadModels,
              child: const Text('Tentar novamente'),
            ),
          if (model != null) ...[
            const SizedBox(height: 8),
            if (model.classes.isNotEmpty)
              ExpansionTile(
                key: ValueKey(model.id),
                tilePadding: EdgeInsets.zero,
                shape: const Border(),
                collapsedShape: const Border(),
                title: Text(
                  '${model.classes.length} ${model.classes.length == 1 ? 'classe disponível' : 'classes disponíveis'}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xff53624c),
                  ),
                ),
                childrenPadding: const EdgeInsets.only(bottom: 8),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(model.classes.map((c) => c.name).join(', '))],
              ),
          ],
        ],
      ),
    );
    final imagesPanel = _panel(
      'Imagens',
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                style: _sourceButtonStyle,
                onPressed: _submitting || _picking || _files.length >= 20
                    ? null
                    : () => _pick(camera: true),
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('Tirar foto'),
              ),
              OutlinedButton.icon(
                style: _sourceButtonStyle,
                onPressed: _submitting || _picking || _files.length >= 20
                    ? null
                    : () => _pick(),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Galeria'),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              style: _textButtonStyle,
              onPressed: _submitting || _picking ? null : _chooseUpload,
              child: Text(
                _device ? 'Selecionar upload existente' : 'Trocar upload',
              ),
            ),
          ),
          if (_picking)
            const Text('Selecionando…', semanticsLabel: 'Selecionando imagens'),
          if (_device) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$_count ${_count == 1 ? 'imagem selecionada' : 'imagens selecionadas'}',
                  ),
                ),
                if (_files.isNotEmpty)
                  TextButton(
                    style: _textButtonStyle,
                    onPressed: _submitting || _picking
                        ? null
                        : () => setState(_files.clear),
                    child: const Text('Limpar'),
                  ),
              ],
            ),
            if (_files.isNotEmpty) ...[
              const SizedBox(height: 8),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 180,
                  childAspectRatio: 1,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: _files.length,
                itemBuilder: (context, index) => Column(
                  children: [
                    Expanded(
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: _files[index].thumbnail == null
                                ? const Icon(Icons.broken_image_outlined)
                                : Image.memory(
                                    _files[index].thumbnail!,
                                    fit: BoxFit.cover,
                                    cacheWidth: 360,
                                    errorBuilder: (_, _, _) =>
                                        const Icon(Icons.broken_image_outlined),
                                  ),
                          ),
                          Positioned(
                            top: 0,
                            right: 0,
                            child: IconButton.filledTonal(
                              tooltip: 'Remover ${_files[index].label(index)}',
                              style: IconButton.styleFrom(
                                backgroundColor: const Color(0xfff0f4ed),
                                foregroundColor: const Color(0xff245d38),
                                minimumSize: const Size(48, 48),
                                visualDensity: VisualDensity.standard,
                              ),
                              onPressed: _submitting || _picking
                                  ? null
                                  : () =>
                                        setState(() => _files.removeAt(index)),
                              icon: const Icon(Icons.close),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _files[index].label(index),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ] else ...[
            if (_upload != null) ...[
              UploadCover(future: _cover!),
              const SizedBox(height: 8),
              Text(
                '${_propertyNames[_upload!.propertyId] ?? 'Upload'} · ${DateFormat('dd/MM/yyyy').format(_upload!.activityDate)} · $_count ${_count == 1 ? 'imagem para analisar' : 'imagens para analisar'}',
              ),
              if (_upload!.id == widget.initialUpload?.id &&
                  widget.imageId != null)
                const Text('Imagem selecionada no upload.'),
            ],
            if (_files.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  style: _textButtonStyle,
                  onPressed: _submitting || _picking
                      ? null
                      : () => setState(() {
                          _device = true;
                          _error = null;
                        }),
                  child: const Text('Usar imagens do dispositivo'),
                ),
              ),
          ],
          const SizedBox(height: 16),
          if (_device) ...[
            const Text(
              'JPEG, PNG ou WebP · Máx. 20 · 25 MB cada',
              style: _secondaryTextStyle,
            ),
            if (kIsWeb)
              const Text(
                'Se a câmera não abrir neste navegador, use a galeria.',
                style: _secondaryTextStyle,
              ),
          ],
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          if (_submitting) Semantics(liveRegion: true, child: Text(_stage)),
          if (!_submitting)
            Text(
              _modelId == null
                  ? 'Selecione um modelo para continuar.'
                  : _count == 0
                  ? 'Adicione imagens para continuar.'
                  : 'Requer conexão com a internet.',
              style: _secondaryTextStyle,
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xff426b2d),
              minimumSize: const Size(0, 48),
              visualDensity: VisualDensity.standard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: _canSubmit ? _submit : null,
            icon: Icon(_submitting ? Icons.hourglass_empty : Icons.play_arrow),
            label: Text(_submitting ? 'Enviando…' : 'Executar inferência'),
          ),
        ],
      ),
    );
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
        child: constraints.maxWidth > 800
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 300, child: modelPanel),
                  Expanded(child: imagesPanel),
                ],
              )
            : Column(children: [modelPanel, imagesPanel]),
      ),
    );
  }

  Widget _history() => RefreshIndicator(
    onRefresh: _loadJobs,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '$_total ${_total == 1 ? 'execução' : 'execuções'}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            IconButton(
              style: IconButton.styleFrom(
                minimumSize: const Size(48, 48),
                visualDensity: VisualDensity.standard,
              ),
              tooltip: 'Atualizar histórico',
              onPressed: _jobsLoading ? null : _loadJobs,
              icon: _jobsRefreshing && _jobs.isNotEmpty
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
            ),
          ],
        ),
        SizedBox(
          height: 2,
          child: _jobsLoading && _jobs.isEmpty
              ? const LinearProgressIndicator(minHeight: 2)
              : null,
        ),
        if (_jobsError != null) Text(_jobsError!),
        if (!_jobsLoading && _jobs.isEmpty && _jobsError == null)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Suas análises aparecerão aqui. Execute uma inferência para acompanhar os resultados.',
            ),
          ),
        for (final job in _jobs)
          _panel(
            job.modelName,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${job.status == 'completed' ? '${job.imageCount} ${job.imageCount == 1 ? 'imagem' : 'imagens'}' : '${job.completedCount} de ${job.imageCount} concluídas'} · ${job.sourceType == 'upload' ? 'Upload existente' : 'Do dispositivo'}',
                ),
                if (job.failedCount > 0)
                  Text(
                    '${job.failedCount} ${job.failedCount == 1 ? 'falha' : 'falhas'}',
                    style: const TextStyle(color: Color(0xffb42318)),
                  ),
                const SizedBox(height: 4),
                Text(
                  DateFormat(
                    'dd/MM/yyyy · HH:mm',
                  ).format(job.createdAt.toLocal()),
                  style: _secondaryTextStyle,
                ),
                if (job.expiresAt != null)
                  Tooltip(
                    message:
                        'Disponível até ${DateFormat('dd/MM/yyyy HH:mm').format(job.expiresAt!.toLocal())}',
                    child: Text(
                      'Disponível até ${DateFormat('dd/MM').format(job.expiresAt!.toLocal())}',
                      style: _secondaryTextStyle,
                    ),
                  ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          style: _textButtonStyle,
                          onPressed: () => _open(job),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Flexible(child: Text('Ver resultados')),
                              SizedBox(width: 8),
                              Icon(Icons.arrow_forward, size: 18),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (job.status != 'queued' && job.status != 'running')
                      PopupMenuButton<String>(
                        style: IconButton.styleFrom(
                          minimumSize: const Size(48, 48),
                          visualDensity: VisualDensity.standard,
                        ),
                        tooltip: 'Opções da execução',
                        icon: const Icon(Icons.more_vert),
                        onSelected: (_) => _delete(job),
                        itemBuilder: (_) => [
                          const PopupMenuItem(
                            value: 'delete',
                            child: Text('Excluir execução'),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
            trailing: DecoratedBox(
              decoration: BoxDecoration(
                color: job.status == 'failed'
                    ? const Color(0xfffceeed)
                    : job.status == 'completed'
                    ? const Color(0xffedf5e9)
                    : const Color(0xfff0f4ed),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Text(
                  inferenceStatus(job.status),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: job.status == 'failed'
                        ? const Color(0xffb42318)
                        : job.status == 'completed'
                        ? const Color(0xff245d38)
                        : const Color(0xff53624c),
                  ),
                ),
              ),
            ),
          ),
        if (_total > 20)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: _jobsLoading || _offset == 0
                    ? null
                    : () {
                        _offset -= 20;
                        _loadJobs();
                      },
                child: const Text('Anterior'),
              ),
              Text(
                '${_total == 0 ? 0 : _offset + 1}–${_offset + _jobs.length} de $_total',
              ),
              TextButton(
                onPressed: _jobsLoading || _offset + 20 >= _total
                    ? null
                    : () {
                        _offset += 20;
                        _loadJobs();
                      },
                child: const Text('Próxima'),
              ),
            ],
          ),
      ],
    ),
  );
}

class UploadCover extends StatelessWidget {
  final Future<String?> future;
  const UploadCover({super.key, required this.future});
  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 16 / 9,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: ColoredBox(
        color: const Color(0xffedf2e9),
        child: FutureBuilder<String?>(
          future: future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.data == null) {
              return const Center(
                child: Icon(
                  Icons.image_not_supported_outlined,
                  semanticLabel: 'Capa indisponível',
                ),
              );
            }
            return Image.network(
              snapshot.data!,
              fit: BoxFit.cover,
              semanticLabel: 'Capa do upload',
              errorBuilder: (_, _, _) =>
                  const Center(child: Icon(Icons.image_not_supported_outlined)),
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : const Center(child: CircularProgressIndicator()),
            );
          },
        ),
      ),
    ),
  );
}

class _UploadPicker extends StatefulWidget {
  final InferenceService service;
  const _UploadPicker({required this.service});
  @override
  State<_UploadPicker> createState() => _UploadPickerState();
}

class _UploadPickerState extends State<_UploadPicker> {
  Map<String, String> _names = {};
  final List<UploadDetail> _uploads = [];
  bool _loading = false, _more = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
    unawaited(_loadNames());
  }

  Future<void> _loadNames() async {
    try {
      final names = await widget.service.propertyNames();
      if (mounted) setState(() => _names = names);
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final uploads = await widget.service.uploads(_uploads.length);
      if (mounted) {
        setState(() {
          _uploads.addAll(uploads.where((u) => u.status == 'ready'));
          _more = uploads.length == 20;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível carregar uploads. Verifique a conexão.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Selecionar upload')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final upload in _uploads)
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(
              _names[upload.propertyId] ??
                  'Upload ${upload.id.substring(0, 8)}',
            ),
            subtitle: Text(
              '${DateFormat('dd/MM/yyyy').format(upload.activityDate)} · ${upload.fileCount} imagens',
            ),
            onTap: upload.fileCount > 0
                ? () => Navigator.pop(context, upload)
                : null,
          ),
        if (_error != null) Text(_error!),
        if (_loading) const LinearProgressIndicator(),
        if (!_loading && _uploads.isEmpty && _error == null)
          const Text(
            'Nenhum upload pronto. Envie imagens ou escolha arquivos do dispositivo.',
          ),
        if (!_loading && (_more || _error != null))
          TextButton(
            onPressed: _load,
            child: Text(_error != null ? 'Tentar novamente' : 'Carregar mais'),
          ),
      ],
    ),
  );
}
