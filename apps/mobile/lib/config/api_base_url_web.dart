/// Web builds (the PWA served by the API) default to same-origin `/api`,
/// which needs no CORS configuration.
String? platformDefaultApiBaseUrl() => '${Uri.base.origin}/api';
