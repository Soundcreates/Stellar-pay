import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/wallet_connect_service.dart';

void main() {
  test('queues cold-start links until the wallet is ready', () async {
    final received = <String>[];
    final router = WalletDeepLinkRouter();

    await router.receive('stellarpay://wc-return');
    expect(received, isEmpty);

    await router.attach((link) async => received.add(link));
    expect(received, ['stellarpay://wc-return']);
  });

  test(
    'forwards warm-resume links after attachment and ignores empty links',
    () async {
      final received = <String>[];
      final router = WalletDeepLinkRouter();
      await router.attach((link) async => received.add(link));

      await router.receive('');
      await router.receive('stellarpay://wc-resume');

      expect(received, ['stellarpay://wc-resume']);
    },
  );
}
