import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('wallet bootstrap keeps the app shell available', (tester) async {
    await tester.pumpWidget(const WalletBootstrap());
    await tester.pump();

    expect(find.text('Start a direct message'), findsOneWidget);
  });
}
