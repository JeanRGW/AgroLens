import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../services/location_service.dart';
import '../utils/location_defaults.dart';

class LocationPickerScreen extends StatefulWidget {
  final double? initialLatitude;
  final double? initialLongitude;
  final String title;
  final String confirmButtonLabel;
  final bool showCurrentLocationButton;

  const LocationPickerScreen({
    super.key,
    this.initialLatitude,
    this.initialLongitude,
    this.title = 'Selecionar localização',
    this.confirmButtonLabel = 'Confirmar ponto',
    this.showCurrentLocationButton = true,
  });

  static Future<LatLng?> show(
    BuildContext context, {
    double? initialLatitude,
    double? initialLongitude,
    String title = 'Selecionar localização',
    String confirmButtonLabel = 'Confirmar ponto',
    bool showCurrentLocationButton = true,
  }) {
    return Navigator.of(context).push<LatLng>(
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          initialLatitude: initialLatitude,
          initialLongitude: initialLongitude,
          title: title,
          confirmButtonLabel: confirmButtonLabel,
          showCurrentLocationButton: showCurrentLocationButton,
        ),
      ),
    );
  }

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final MapController _mapController = MapController();
  late LatLng _selectedPoint;
  bool _isLocating = false;
  String? _gpsError;

  @override
  void initState() {
    super.initState();
    _selectedPoint = resolveLocationPickerPoint(
      latitude: widget.initialLatitude,
      longitude: widget.initialLongitude,
    );
    if (widget.initialLatitude == null || widget.initialLongitude == null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _centerOnCurrentLocation(),
      );
    }
  }

  Future<void> _centerOnCurrentLocation() async {
    if (_isLocating) return;
    setState(() {
      _isLocating = true;
      _gpsError = null;
    });

    try {
      final point = await const LocationService().getCurrentPosition();
      if (!mounted) return;

      setState(() {
        _selectedPoint = point;
        _gpsError = null;
      });
      _mapController.move(point, 17);
    } on LocationException catch (e) {
      _gpsError = e.message;
    } catch (_) {
      _gpsError = 'Não foi possível obter sua localização atual.';
    } finally {
      if (mounted) setState(() => _isLocating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _selectedPoint,
                initialZoom: 13,
                minZoom: 3,
                maxZoom: 19,
                onTap: (_, point) {
                  setState(() => _selectedPoint = point);
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'app.rgw.agrolens.app',
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _selectedPoint,
                      width: 48,
                      height: 48,
                      child: const Icon(
                        Icons.location_pin,
                        size: 44,
                        color: Colors.red,
                      ),
                    ),
                  ],
                ),
                const SimpleAttributionWidget(
                  source: Text('OpenStreetMap contributors'),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            color: Theme.of(context).colorScheme.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Toque no mapa para ajustar o ponto.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 8),
                Text('Latitude: ${_selectedPoint.latitude.toStringAsFixed(6)}'),
                const SizedBox(height: 4),
                Text(
                  'Longitude: ${_selectedPoint.longitude.toStringAsFixed(6)}',
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (widget.showCurrentLocationButton)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _isLocating
                              ? null
                              : _centerOnCurrentLocation,
                          icon: _isLocating
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.my_location),
                          label: const Text('Minha localização'),
                        ),
                      ),
                    if (widget.showCurrentLocationButton)
                      const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            Navigator.of(context).pop(_selectedPoint),
                        icon: const Icon(Icons.check),
                        label: Text(widget.confirmButtonLabel),
                      ),
                    ),
                  ],
                ),
                if (_gpsError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _gpsError!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
