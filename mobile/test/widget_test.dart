import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('shows the Stellar Pay start screen', (tester) async {
    await tester.pumpWidget(const StellarPayApp());
    expect(find.text('Start a direct message'), findsOneWidget);
  });
}
