import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:reown_appkit/reown_appkit.dart';

import 'app_config.dart';

/// Buffers wallet callbacks that arrive before Reown has finished starting.
class WalletDeepLinkRouter {
  final _pending = <String>[];
  Future<void> Function(String)? _dispatch;

  Future<void> receive(String link) async {
    if (link.isEmpty) return;
    final dispatch = _dispatch;
    if (dispatch == null) {
      _pending.add(link);
      return;
    }
    await dispatch(link);
  }

  Future<void> attach(Future<void> Function(String) dispatch) async {
    _dispatch = dispatch;
    final pending = List<String>.from(_pending);
    _pending.clear();
    for (final link in pending) {
      await dispatch(link);
    }
  }
}

/// App-wide EVM wallet state. Stellar identities and XDR signing remain separate.
class WalletConnectService extends ChangeNotifier {
  static String get projectId => AppConfig.reownProjectId;
  static const redirectUri = 'stellarpay://';

  static const _methodsChannel = MethodChannel(
    'com.walletconnect.flutterdapp/methods',
  );
  static const _eventsChannel = EventChannel(
    'com.walletconnect.flutterdapp/events',
  );

  ReownAppKitModal? _appKit;
  bool _initializing = false;
  final _deepLinks = WalletDeepLinkRouter();
  StreamSubscription<dynamic>? _deepLinkSubscription;
  String? error;

  WalletConnectService() {
    _deepLinkSubscription = _eventsChannel.receiveBroadcastStream().listen(
      (link) {
        if (link is String) unawaited(_deepLinks.receive(link));
      },
      onError: (Object exception, StackTrace stackTrace) {
        debugPrint('Wallet deep-link listener failed: $exception');
      },
    );
  }

  ReownAppKitModal get appKit => _appKit!;
  bool get isReady => _appKit != null;
  bool get isConnected => _appKit?.isConnected ?? false;
  String? get activeChainId => _appKit?.selectedChain?.chainId;

  Future<void> openConnectModal() async {
    if (!isReady) return;
    try {
      await _appKit!.openModalView();
    } catch (exception) {
      String detail;
      try {
        detail = '${(exception as dynamic).message}';
      } catch (_) {
        detail = exception.toString();
      }
      error = 'Wallet connect failed: $detail';
      notifyListeners();
    }
  }

  String? get address {
    final session = _appKit?.session;
    final chainId = activeChainId;
    if (session == null || chainId == null) return null;
    return session.getAddress(NamespaceUtils.getNamespaceFromChain(chainId));
  }

  String? get stellarAddress => _appKit?.session?.getAddress('stellar');

  Future<void> initialize(BuildContext context) async {
    if (_initializing || isReady) return;
    if (projectId.isEmpty) {
      error = 'Set REOWN_PROJECT_ID with --dart-define to enable EVM wallets.';
      notifyListeners();
      return;
    }

    _initializing = true;
    ReownAppKitModalNetworks.removeSupportedNetworks('solana');

    _appKit = ReownAppKitModal(
      context: context,
      projectId: projectId,
      metadata: const PairingMetadata(
        name: 'Stellar Pay',
        description: 'Chat-first social payments',
        url: 'https://stellar-splitwise-web.vercel.app',
        icons: ['https://stellar.org/favicon.ico'],
        redirect: Redirect(native: redirectUri, linkMode: false),
      ),
      optionalNamespaces: {
        'eip155': RequiredNamespace.fromJson({
          'chains': const ['eip155:1', 'eip155:137', 'eip155:11155111'],
          'methods': NetworkUtils.defaultNetworkMethods['eip155']!.toList(),
          'events': NetworkUtils.defaultNetworkEvents['eip155']!.toList(),
        }),
        // Stellar isn't a namespace AppKit knows natively; these method names
        // are Freighter's own WalletConnect convention (no CAIP standard
        // exists for Stellar RPC methods), so this only works with wallets
        // that follow the same convention.
        'stellar': RequiredNamespace.fromJson({
          'chains': const ['stellar:testnet'],
          'methods': const [
            'stellar_signXDR',
            'stellar_signAndSubmitXDR',
            'stellar_signMessage',
            'stellar_signAuthEntry',
          ],
          'events': const ['accountsChanged'],
        }),
      },
    );

    _appKit!.onModalConnect.subscribe((_) => notifyListeners());
    _appKit!.onModalUpdate.subscribe((_) => notifyListeners());
    _appKit!.onModalNetworkChange.subscribe((_) => notifyListeners());
    _appKit!.onModalDisconnect.subscribe((_) => notifyListeners());

    try {
      await _appKit!.init();
      final initialLink = await _readInitialLink();
      await _deepLinks.attach(_dispatchDeepLink);
      if (initialLink != null) await _deepLinks.receive(initialLink);
    } catch (exception) {
      error = exception.toString();
      _appKit = null;
    } finally {
      _initializing = false;
      notifyListeners();
    }
  }

  Future<String?> _readInitialLink() async {
    try {
      return await _methodsChannel.invokeMethod<String>('initialLink');
    } on MissingPluginException {
      return null;
    } catch (exception) {
      debugPrint('Wallet initial deep-link read failed: $exception');
      return null;
    }
  }

  Future<void> _dispatchDeepLink(String link) async {
    try {
      await _appKit?.dispatchEnvelope(link);
    } catch (exception) {
      error = 'Wallet deep link failed: $exception';
      notifyListeners();
    }
  }

  @override
  void dispose() {
    final subscription = _deepLinkSubscription;
    if (subscription != null) unawaited(subscription.cancel());
    super.dispose();
  }
}

class WalletScope extends InheritedNotifier<WalletConnectService> {
  const WalletScope({
    super.key,
    required WalletConnectService wallet,
    required super.child,
  }) : super(notifier: wallet);

  static WalletConnectService? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<WalletScope>()?.notifier;
}

class EvmWalletControls extends StatelessWidget {
  const EvmWalletControls({super.key});

  @override
  Widget build(BuildContext context) {
    final wallet = WalletScope.maybeOf(context);
    if (wallet == null) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: wallet,
      builder: (context, _) {
        if (wallet.error != null) {
          return Text(wallet.error!, style: const TextStyle(fontSize: 11));
        }
        if (!wallet.isReady) return const SizedBox(height: 4);

        // AppKitModalNetworkSelectButton/AppKitModalAccountButton only know
        // about eip155/solana chains (via selectedChain); a Stellar-only
        // session has no selectedChain, so those widgets render blank.
        final stellarAddress = wallet.stellarAddress;
        if (wallet.isConnected && stellarAddress != null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(stellarAddress, style: const TextStyle(fontSize: 11)),
              const Text('stellar:testnet', style: TextStyle(fontSize: 10)),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: wallet.appKit.disconnect,
                child: const Text('Disconnect'),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppKitModalNetworkSelectButton(appKit: wallet.appKit),
            if (wallet.isConnected) ...[
              const SizedBox(height: 8),
              Text(
                wallet.address ?? 'Connected',
                style: const TextStyle(fontSize: 11),
              ),
              Text(
                wallet.activeChainId ?? '',
                style: const TextStyle(fontSize: 10),
              ),
              const SizedBox(height: 8),
              AppKitModalAccountButton(appKitModal: wallet.appKit),
            ],
          ],
        );
      },
    );
  }
}
