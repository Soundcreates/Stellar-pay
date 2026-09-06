import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Compile-time `--dart-define` values win; local `.env` is the fallback.
class AppConfig {
  AppConfig._();

  static const _apiDefault = 'https://stellar-splitwise.onrender.com';

  static String get apiBase {
    const backendDefined = String.fromEnvironment('BACKEND_BASE_URL');
    if (backendDefined.isNotEmpty) return backendDefined;
    const apiDefined = String.fromEnvironment('API_BASE');
    if (apiDefined.isNotEmpty) return apiDefined;
    final fromBackendFile = _env('BACKEND_BASE_URL');
    if (fromBackendFile.isNotEmpty) return fromBackendFile;
    final fromFile = _env('API_BASE');
    return fromFile.isNotEmpty ? fromFile : _apiDefault;
  }

  static String get reownProjectId {
    const defined = String.fromEnvironment('REOWN_PROJECT_ID');
    if (defined.isNotEmpty) return defined;
    return _env('REOWN_PROJECT_ID');
  }

  static String _env(String key) {
    if (!dotenv.isInitialized) return '';
    return dotenv.maybeGet(key) ?? '';
  }
}
