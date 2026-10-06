import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/inference.dart';
import '../services/inference_service.dart';
import '../utils/save_inference_export.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/custom_scaffold.dart';

const _colors = [
  Color(0xff176b4a),
  Color(0xff2358a8),
  Color(0xffa14a16),
  Color(0xff873ba1),
  Color(0xffa72645),
  Color(0xff146c80),
];
Color detectionColor(int id) => _colors[id % _colors.length];

class InferenceViewerScreen extends StatefulWidget {
  final InferenceService service;
  final String jobId;
  const InferenceViewerScreen({
    super.key,
    required this.service,
    required this.jobId,
  });
  @override
  State<InferenceViewerScreen> createState() => _InferenceViewerScreenState();
}

class _InferenceViewerScreenState extends State<InferenceViewerScreen>
    with WidgetsBindingObserver {
  InferenceJob? _job;
  InferenceResult? _result;
  final Map<String, InferenceResult> _visited = {};
  String? _jobError, _imageError;
  String? _selectedId;
  bool _jobLoading = false,
      _imageLoading = false,
      _labels = true,
      _boxes = true,
      _exporting = false;
  double _confidence = 0;
  final Set<int> _hidden = {};
  int _request = 0;
  Timer? _poll;
  bool _foreground = true;
  ImageStream? _stream;
  ImageStreamListener? _listener;
  Size? _natural;
  Size _viewport = Size.zero;
  final _transform = TransformationController();
  final _exportButtonKey = GlobalKey();
  List<Detection> get _visible =>
      _result?.detections
          .where(
            (d) => d.confidence >= _confidence && !_hidden.contains(d.classId),
          )
          .toList() ??
      [];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadJob();
  }

  void _detachImage() {
    if (_listener != null) _stream?.removeListener(_listener!);
    _stream = null;
    _listener = null;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _request++;
    _poll?.cancel();
    _detachImage();
    _transform.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _poll?.cancel();
    if (state == AppLifecycleState.resumed) _loadJob();
  }

  Future<void> _loadJob() async {
    if (_jobLoading) return;
    _poll?.cancel();
    setState(() {
      _jobLoading = true;
      _jobError = null;
    });
    try {
      final job = await widget.service.job(widget.jobId);
      if (!mounted) return;
      setState(() => _job = job);
      final selected = job.images.where((i) => i.id == _selectedId).firstOrNull;
      if (_selectedId == null && job.images.isNotEmpty) {
        await _loadImage(job.images.first);
      } else if (selected != null &&
          selected.status == 'completed' &&
          _result == null &&
          !_imageLoading &&
          _imageError == null) {
        await _loadImage(selected);
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _jobError =
              'Não foi possível carregar a execução. Verifique a conexão.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _jobLoading = false);
        if (_foreground && _job?.active == true) {
          _poll = Timer.periodic(const Duration(seconds: 5), (_) {
            if (mounted && ModalRoute.of(context)?.isCurrent == true) {
              _loadJob();
            }
          });
        }
      }
    }
  }

  Future<void> _loadImage(InferenceImage image) async {
    final request = ++_request;
    _detachImage();
    setState(() {
      _selectedId = image.id;
      _result = null;
      _natural = null;
      _imageError = null;
      _imageLoading = image.status == 'completed';
      _hidden.clear();
    });
    if (image.status != 'completed') return;
    try {
      final result = await widget.service.image(widget.jobId, image.id);
      if (!mounted || request != _request) return;
      setState(() {
        _result = result;
        _visited[result.id] = result;
      });
      final provider = NetworkImage(result.imageUrl);
      _stream = provider.resolve(const ImageConfiguration());
      _listener = ImageStreamListener(
        (info, _) {
          if (!mounted || request != _request) {
            info.dispose();
            return;
          }
          setState(() {
            _natural = Size(
              info.image.width.toDouble(),
              info.image.height.toDouble(),
            );
            _imageLoading = false;
          });
          info.dispose();
          _fit();
        },
        onError: (Object error, StackTrace? stack) {
          if (!mounted || request != _request) return;
          setState(() {
            _imageError =
                'Não foi possível carregar a imagem. Busque um novo endereço para tentar novamente.';
            _result = null;
            _natural = null;
            _imageLoading = false;
          });
        },
      );
      _stream!.addListener(_listener!);
    } catch (_) {
      if (mounted && request == _request) {
        setState(() {
          _imageError =
              'Não foi possível carregar os resultados. Tente novamente.';
          _imageLoading = false;
        });
      }
    }
  }

  void _scale(double scale) {
    final size = _natural;
    if (size == null) return;
    _transform.value = Matrix4.identity()
      ..setTranslationRaw(
        (_viewport.width - size.width * scale) / 2,
        (_viewport.height - size.height * scale) / 2,
        0,
      )
      ..scaleByDouble(scale, scale, scale, 1);
  }

  void _fit() {
    if (_natural == null || _viewport.isEmpty) return;
    _scale(
      math.min(
        _viewport.width / _natural!.width,
        _viewport.height / _natural!.height,
      ),
    );
  }

  void _zoom(double factor) {
    final current = _transform.value.getMaxScaleOnAxis();
    final scale = (current * factor).clamp(0.01, 8.0);
    final ratio = scale / current;
    final matrix = _transform.value.clone();
    final translation = matrix.getTranslation();
    matrix.setTranslationRaw(
      _viewport.width / 2 + (translation.x - _viewport.width / 2) * ratio,
      _viewport.height / 2 + (translation.y - _viewport.height / 2) * ratio,
      0,
    );
    matrix.scaleByDouble(ratio, ratio, ratio, 1);
    _transform.value = matrix;
  }

  Future<void> _export(String format) async {
    setState(() => _exporting = true);
    try {
      // Fetch all completed results so exports are not limited to visited images.
      final results = <InferenceResult>[];
      for (final image in _job!.images.where((i) => i.status == 'completed')) {
        results.add(
          _visited[image.id] ??
              await widget.service.image(widget.jobId, image.id),
        );
        if (!mounted) return;
      }
      final String content;
      if (format == 'json') {
        content = const JsonEncoder.withIndent('  ').convert({
          'jobId': widget.jobId,
          'images': results.map((r) => r.json).toList(),
        });
      } else {
        String cell(Object value) =>
            '"${value.toString().replaceAll('"', '""')}"';
        content = [
          'imageId,classId,className,confidence,xCenter,yCenter,width,height',
          for (final result in results)
            for (final d in result.detections)
              [
                result.id,
                d.classId,
                d.className,
                d.confidence,
                d.xCenter,
                d.yCenter,
                d.width,
                d.height,
              ].map(cell).join(','),
        ].join('\r\n');
      }
      if (!mounted) return;
      final exportBox = _exportButtonKey.currentContext?.findRenderObject();
      if (exportBox is! RenderBox || !exportBox.hasSize) return;
      final message = await saveInferenceExport(
        'inference-${widget.jobId}.$format',
        content,
        sharePositionOrigin:
            exportBox.localToGlobal(Offset.zero) & exportBox.size,
      );
      if (mounted && message != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível exportar. Verifique a conexão e tente novamente.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _job?.images.where((i) => i.id == _selectedId).firstOrNull;
    return CustomScaffold(
      appBar: CustomAppBar(
        leading: CustomAppBarAction.backButton(context),
        title: _job?.modelName ?? 'Resultados',
        subtitle: _job == null ? 'Inferência' : inferenceStatus(_job!.status),
        actions: [
          CustomAppBarAction(
            child: PopupMenuButton<String>(
              key: _exportButtonKey,
              tooltip: 'Exportar resultados',
              enabled: _job != null && !_exporting,
              icon: const Icon(Icons.download, color: Colors.white),
              onSelected: _export,
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'json', child: Text('Exportar JSON')),
                PopupMenuItem(value: 'csv', child: Text('Exportar CSV')),
              ],
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_jobLoading) const LinearProgressIndicator(),
          if (_jobError != null) ...[
            Text(_jobError!),
            TextButton(
              onPressed: _loadJob,
              child: const Text('Tentar novamente'),
            ),
          ],
          if (_job != null) ...[
            Text(
              '${_job!.completedCount} de ${_job!.imageCount} imagens concluídas · ${_job!.failedCount} falhas',
            ),
            if (_job!.errorMessage != null) Text(_job!.errorMessage!),
            const SizedBox(height: 12),
            if (_job!.images.isEmpty)
              const Text('Esta execução não possui imagens.'),
            if (_job!.images.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _selectedId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Imagem',
                  border: OutlineInputBorder(),
                ),
                items: _job!.images
                    .map(
                      (i) => DropdownMenuItem(
                        value: i.id,
                        child: Text(
                          '${i.fileName} · ${inferenceStatus(i.status)}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (id) {
                  if (id != null) {
                    _loadImage(_job!.images.firstWhere((i) => i.id == id));
                  }
                },
              ),
            const SizedBox(height: 12),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                IconButton(
                  tooltip: 'Reduzir zoom',
                  onPressed: _natural == null ? null : () => _zoom(0.75),
                  icon: const Icon(Icons.remove),
                ),
                ValueListenableBuilder<Matrix4>(
                  valueListenable: _transform,
                  builder: (_, matrix, _) => TextButton(
                    onPressed: _natural == null ? null : () => _scale(1),
                    child: Text(
                      '${(matrix.getMaxScaleOnAxis() * 100).round()}%',
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Aumentar zoom',
                  onPressed: _natural == null ? null : () => _zoom(1.25),
                  icon: const Icon(Icons.add),
                ),
                TextButton(
                  onPressed: _natural == null ? null : _fit,
                  child: const Text('Ajustar'),
                ),
                IconButton(
                  tooltip: _boxes ? 'Ocultar caixas' : 'Mostrar caixas',
                  onPressed: () => setState(() => _boxes = !_boxes),
                  icon: Icon(
                    _boxes ? Icons.crop_free : Icons.visibility_off_outlined,
                  ),
                ),
                IconButton(
                  tooltip: _labels ? 'Ocultar rótulos' : 'Mostrar rótulos',
                  onPressed: () => setState(() => _labels = !_labels),
                  icon: Icon(_labels ? Icons.label : Icons.label_off_outlined),
                ),
              ],
            ),
            SizedBox(
              height: 360,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final viewport = constraints.biggest;
                  if (viewport != _viewport) {
                    _viewport = viewport;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) _fit();
                    });
                  }
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: ColoredBox(
                      color: const Color(0xffedf2e9),
                      child: _imageError != null
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _imageError!,
                                      textAlign: TextAlign.center,
                                    ),
                                    TextButton(
                                      onPressed: selected == null
                                          ? null
                                          : () => _loadImage(selected),
                                      child: const Text('Carregar novamente'),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : _imageLoading
                          ? const Center(child: CircularProgressIndicator())
                          : _natural == null
                          ? Center(
                              child: Text(
                                selected?.status == 'failed'
                                    ? 'Falha ao analisar esta imagem.'
                                    : 'Aguardando processamento…',
                              ),
                            )
                          : InteractiveViewer(
                              transformationController: _transform,
                              constrained: false,
                              minScale: 0.01,
                              maxScale: 8,
                              boundaryMargin: const EdgeInsets.all(
                                double.infinity,
                              ),
                              child: SizedBox(
                                width: _natural!.width,
                                height: _natural!.height,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    Image.network(
                                      _result!.imageUrl,
                                      fit: BoxFit.fill,
                                    ),
                                    if (_boxes)
                                      ValueListenableBuilder<Matrix4>(
                                        valueListenable: _transform,
                                        builder: (_, matrix, _) => CustomPaint(
                                          painter: DetectionPainter(
                                            _visible,
                                            labels: _labels,
                                            scale: matrix.getMaxScaleOnAxis(),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            Text('Confiança mínima: ${(_confidence * 100).round()}%'),
            Slider(
              value: _confidence,
              onChanged: (value) => setState(() => _confidence = value),
            ),
            Text(
              '${_visible.length} detecções visíveis',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final id
                in (_result?.detections
                          .map((d) => d.classId)
                          .toSet()
                          .toList() ??
                      <int>[])
                  ..sort())
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                activeColor: detectionColor(id),
                title: Text(
                  _result!.detections
                      .firstWhere((d) => d.classId == id)
                      .className,
                ),
                subtitle: Text(
                  '${_result!.detections.where((d) => d.classId == id && d.confidence >= _confidence).length} detecções',
                ),
                value: !_hidden.contains(id),
                onChanged: (value) => setState(() {
                  if (value == true) {
                    _hidden.remove(id);
                  } else {
                    _hidden.add(id);
                  }
                }),
              ),
            if (_result != null && _result!.detections.isEmpty)
              const Text('Nenhum objeto detectado nesta imagem.'),
            ExpansionTile(
              title: const Text('Resumo das imagens visualizadas'),
              children: [
                ListTile(
                  title: Text(
                    '${_visited.length} imagens · ${_visited.values.fold<int>(0, (total, r) => total + r.detections.length)} detecções',
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class DetectionPainter extends CustomPainter {
  final List<Detection> detections;
  final bool labels;
  final double scale;
  DetectionPainter(this.detections, {required this.labels, this.scale = 1});
  @override
  void paint(Canvas canvas, Size size) {
    for (final d in detections) {
      final rect = Rect.fromCenter(
        center: Offset(d.xCenter * size.width, d.yCenter * size.height),
        width: d.width * size.width,
        height: d.height * size.height,
      );
      final color = detectionColor(d.classId);
      canvas.drawRect(
        rect,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2 / scale,
      );
      if (!labels) continue;
      final text = TextPainter(
        text: TextSpan(
          text: '${d.className} ${(d.confidence * 100).round()}%',
          style: TextStyle(
            color: Colors.white,
            fontSize: 14 / scale,
            backgroundColor: color,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width);
      text.paint(
        canvas,
        Offset(
          rect.left.clamp(0, math.max(0, size.width - text.width)).toDouble(),
          (rect.top - text.height)
              .clamp(0, math.max(0, size.height - text.height))
              .toDouble(),
        ),
      );
    }
  }

  @override
  bool shouldRepaint(DetectionPainter oldDelegate) =>
      oldDelegate.detections != detections ||
      oldDelegate.labels != labels ||
      oldDelegate.scale != scale;
}
