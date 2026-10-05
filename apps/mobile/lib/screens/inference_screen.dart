import 'dart:async';
import 'dart:typed_data';
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
  _SelectedImage(this.file, this.sizeBytes, this.thumbnail);
}

class _InferenceScreenState extends State<InferenceScreen>
    with WidgetsBindingObserver {
  List<InferenceModel> _models = [];
  List<InferenceJob> _jobs = [];
  final List<_SelectedImage> _files = [];
  String? _modelId, _modelError, _jobsError, _error;
  UploadDetail? _upload;
  Future<String?>? _cover;
  bool _device = true,
      _modelsLoading = true,
      _jobsLoading = false,
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

  Future<void> _loadJobs() async {
    if (_jobsLoading) return;
    _poll?.cancel();
    setState(() {
      _jobsLoading = true;
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
        setState(() => _jobsLoading = false);
        if (_foreground && _tab == 1 && _jobs.any((job) => job.active)) {
          _poll = Timer.periodic(const Duration(seconds: 5), (_) {
            if (mounted && ModalRoute.of(context)?.isCurrent == true) {
              _loadJobs();
            }
          });
        }
      }
    }
  }

  Future<void> _pick() async {
    setState(() {
      _picking = true;
      _error = null;
    });
    try {
      final picked = await ImagePicker().pickMultiImage();
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
        additions.add(_SelectedImage(file, size, thumbnail));
      }
      if (mounted) setState(() => _files.addAll(additions));
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is FormatException
              ? e.message
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
  Widget _panel(String title, Widget child) => Card(
    elevation: 0,
    shape: RoundedRectangleBorder(
      side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
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
            const SizedBox(height: 16),
            const Text('Classes detectadas'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: model.classes
                  .take(8)
                  .map((c) => Chip(label: Text(c.name)))
                  .toList(),
            ),
            if (model.classes.length > 8)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text('Ver todas as ${model.classes.length} classes'),
                children: [
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: model.classes
                        .skip(8)
                        .map((c) => Chip(label: Text(c.name)))
                        .toList(),
                  ),
                ],
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
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Do dispositivo')),
              ButtonSegment(value: false, label: Text('De um upload')),
            ],
            selected: {_device},
            onSelectionChanged: _submitting || _picking
                ? null
                : (v) => setState(() {
                    _device = v.first;
                    _error = null;
                  }),
          ),
          const SizedBox(height: 16),
          if (_device) ...[
            OutlinedButton.icon(
              onPressed: _submitting || _picking || _files.length >= 20
                  ? null
                  : _pick,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(_picking ? 'Selecionando…' : 'Selecionar imagens'),
            ),
            const Text(
              'JPEG, PNG ou WebP · Até 20 imagens · 25 MB por arquivo',
              style: TextStyle(fontSize: 12),
            ),
            if (_files.isNotEmpty) ...[
              TextButton(
                onPressed: _submitting || _picking
                    ? null
                    : () => setState(_files.clear),
                child: const Text('Limpar seleção'),
              ),
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
                              tooltip: 'Remover ${_files[index].file.name}',
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
                      _files[index].file.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ] else ...[
            OutlinedButton.icon(
              onPressed: _submitting ? null : _chooseUpload,
              icon: const Icon(Icons.cloud_done_outlined),
              label: Text(
                _upload == null ? 'Selecionar upload' : 'Trocar upload',
              ),
            ),
            if (_upload != null) ...[
              UploadCover(future: _cover!),
              const SizedBox(height: 8),
              Text(
                '${_propertyNames[_upload!.propertyId] ?? 'Upload'} · ${DateFormat('dd/MM/yyyy').format(_upload!.activityDate)} · $_count ${_count == 1 ? 'imagem para analisar' : 'imagens para analisar'}',
              ),
              if (_count == 1 && widget.imageId != null)
                const Text('Imagem selecionada no upload.'),
            ],
          ],
          const SizedBox(height: 20),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          Text(
            _submitting
                ? _stage
                : '$_count ${_count == 1 ? 'imagem selecionada' : 'imagens selecionadas'}',
            semanticsLabel: _submitting ? _stage : null,
          ),
          if (!_submitting)
            Text(
              _modelId == null
                  ? 'Selecione um modelo para continuar.'
                  : _count == 0
                  ? 'Adicione imagens para continuar.'
                  : 'A inferência precisa de conexão com a internet.',
              style: const TextStyle(fontSize: 12),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
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
                '$_total execuções',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            IconButton(
              tooltip: 'Atualizar histórico',
              onPressed: _jobsLoading ? null : _loadJobs,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        if (_jobsLoading) const LinearProgressIndicator(),
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
                  inferenceStatus(job.status),
                  style: TextStyle(
                    color: job.status == 'failed'
                        ? Theme.of(context).colorScheme.error
                        : const Color(0xff245d38),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${job.sourceType == 'upload' ? 'Upload existente' : 'Do dispositivo'} · ${job.completedCount} de ${job.imageCount} concluídas',
                ),
                if (job.failedCount > 0) Text('${job.failedCount} falhas'),
                Text(
                  DateFormat(
                    'dd/MM/yyyy HH:mm',
                  ).format(job.createdAt.toLocal()),
                ),
                if (job.expiresAt != null)
                  Text(
                    'Expira em ${DateFormat('dd/MM/yyyy HH:mm').format(job.expiresAt!.toLocal())}',
                  ),
                Row(
                  children: [
                    Expanded(
                      child: TextButton.icon(
                        onPressed: () => _open(job),
                        icon: const Icon(Icons.arrow_forward),
                        label: const Text('Ver resultados'),
                      ),
                    ),
                    if (job.status != 'queued' && job.status != 'running')
                      IconButton(
                        tooltip: 'Excluir execução',
                        onPressed: () => _delete(job),
                        icon: const Icon(Icons.delete_outline),
                      ),
                  ],
                ),
              ],
            ),
          ),
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
