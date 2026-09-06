import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'app_config.dart';
import 'wallet_connect_service.dart';

String get apiBase => AppConfig.apiBase;
const black = Color(0xff090909);
const panel = Color(0xff171717);
const line = Color(0xff3d3d3d);
const muted = Color(0xffa6a6a6);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await dotenv.load(isOptional: true);
  } catch (_) {
    // Release builds inject REOWN_PROJECT_ID / BACKEND_BASE_URL via --dart-define.
  }
  runApp(const WalletBootstrap());
}

class WalletBootstrap extends StatefulWidget {
  const WalletBootstrap({super.key});

  @override
  State<WalletBootstrap> createState() => _WalletBootstrapState();
}

class _WalletBootstrapState extends State<WalletBootstrap> {
  final wallet = WalletConnectService();

  @override
  void dispose() {
    wallet.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      WalletScope(wallet: wallet, child: const StellarPayApp());
}

class Api {
  Future<dynamic> get(String path) async {
    final response = await http.get(Uri.parse('$apiBase$path'));
    return _decode(response);
  }

  Future<dynamic> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$apiBase$path'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(body),
    );
    return _decode(response);
  }

  dynamic _decode(http.Response response) {
    final value = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(
        value is Map ? value['error'] ?? 'Request failed' : 'Request failed',
      );
    }
    return value;
  }
}

class StellarPayApp extends StatefulWidget {
  const StellarPayApp({super.key});

  @override
  State<StellarPayApp> createState() => _StellarPayAppState();
}

class _StellarPayAppState extends State<StellarPayApp> {
  final navigatorKey = GlobalKey<NavigatorState>();
  final api = Api();
  final composer = TextEditingController();
  io.Socket? socket;
  Map<String, dynamic>? profile;
  Map<String, dynamic>? chat;
  List<Map<String, dynamic>> chats = [];
  List<Map<String, dynamic>> messages = [];
  List<Map<String, dynamic>> requests = [];
  List<Map<String, dynamic>> expenses = [];
  List<Map<String, dynamic>> invites = [];
  String notice = '';

  BuildContext get _ctx => navigatorKey.currentContext!;

  String get address => profile?['address'] as String? ?? '';
  String get username => profile?['username'] as String? ?? '';
  bool get isGroup => chat?['type'] == 'group';

  WalletConnectService? _wallet;

  @override
  void initState() {
    super.initState();
    _restore();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wallet = WalletScope.maybeOf(context);
      _wallet?.initialize(_ctx);
      _wallet?.addListener(_onWalletChange);
    });
  }

  void _onWalletChange() {
    final stellarAddress = _wallet?.stellarAddress;
    if (stellarAddress != null && stellarAddress != address) {
      _adoptAddress(stellarAddress);
    }
  }

  void _connectSocket() {
    if (socket != null) return;
    socket =
        io.io(apiBase, io.OptionBuilder().setTransports(['websocket']).build())
          ..on(
            'message:new',
            (data) => _active(
              data,
              () => messages.add(Map<String, dynamic>.from(data)),
            ),
          )
          ..on(
            'request:new',
            (data) => _active(data, () {
              final item = Map<String, dynamic>.from(data);
              if (!requests.any((request) => request['id'] == item['id'])) {
                requests.add(item);
              }
            }),
          )
          ..on(
            'request:updated',
            (data) => _replaceRequest(Map<String, dynamic>.from(data)),
          )
          ..on(
            'expense:new',
            (data) => _active(data, () {
              final item = Map<String, dynamic>.from(data);
              if (!expenses.any((expense) => expense['id'] == item['id'])) {
                expenses.insert(0, item);
              }
            }),
          )
          ..on(
            'expense:updated',
            (data) => _replaceExpense(Map<String, dynamic>.from(data)),
          );
  }

  Future<void> _restore() async {
    final saved = (await SharedPreferences.getInstance()).getString(
      'stellar_address',
    );
    if (saved == null) return;
    try {
      final user = await api.get('/users/address/$saved');
      if (user != null) {
        profile = Map<String, dynamic>.from(user);
        _connectSocket();
        await _loadChats();
        if (mounted) setState(() {});
      }
    } catch (_) {}
  }

  void _active(dynamic data, VoidCallback update) {
    if (data is Map && data['chatId'] == chat?['id']) setState(update);
  }

  void _replaceRequest(Map<String, dynamic> item) {
    if (item['chatId'] != chat?['id']) return;
    setState(
      () => requests = requests
          .map((request) => request['id'] == item['id'] ? item : request)
          .toList(),
    );
  }

  void _replaceExpense(Map<String, dynamic> item) {
    if (item['chatId'] != chat?['id']) return;
    setState(
      () => expenses = item['settled'] == true
          ? expenses.where((expense) => expense['id'] != item['id']).toList()
          : expenses
                .map((expense) => expense['id'] == item['id'] ? item : expense)
                .toList(),
    );
  }

  Future<void> _loadChats() async {
    if (address.isEmpty) return;
    final values = await Future.wait([
      api.get('/chats/user/$address'),
      api.get('/chats/requests/$address'),
    ]);
    chats = List<Map<String, dynamic>>.from(
      values[0].map((item) => Map<String, dynamic>.from(item)),
    );
    invites = List<Map<String, dynamic>>.from(
      values[1].map((item) => Map<String, dynamic>.from(item)),
    );
  }

  Future<void> _openChat(Map<String, dynamic> value) async {
    chat = value;
    messages = [];
    requests = [];
    expenses = [];
    socket?.emit('chat:join', chat!['id']);
    try {
      final values = await Future.wait([
        api.get('/chats/${chat!['id']}/messages'),
        api.get('/chats/${chat!['id']}/requests'),
        api.get('/chats/${chat!['id']}/expenses'),
      ]);
      messages = List<Map<String, dynamic>>.from(
        values[0].map((item) => Map<String, dynamic>.from(item)),
      );
      requests = List<Map<String, dynamic>>.from(
        values[1].map((item) => Map<String, dynamic>.from(item)),
      );
      expenses = List<Map<String, dynamic>>.from(
        values[2].map((item) => Map<String, dynamic>.from(item)),
      );
    } catch (error) {
      notice = error.toString();
    }
    if (mounted) setState(() {});
  }

  Future<void> _connect() async {
    final field = TextEditingController(text: address);
    final result = await _formSheet(
      'Connect Stellar wallet',
      'Paste your Stellar public address. Signing happens in your mobile wallet.',
      field,
      'G… public address',
      'Connect',
    );
    if (result == null) return;
    await _adoptAddress(result);
  }

  Future<void> _adoptAddress(String value) async {
    try {
      final user = await api.get('/users/address/$value');
      profile = user == null
          ? {'address': value}
          : Map<String, dynamic>.from(user);
      await (await SharedPreferences.getInstance()).setString(
        'stellar_address',
        value,
      );
      if (user != null) {
        _connectSocket();
        await _loadChats();
      }
      if (mounted) setState(() {});
      if (user == null && mounted) _claimUsername();
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _claimUsername() async {
    final field = TextEditingController();
    final result = await _formSheet(
      'Claim your username',
      'This address has not been registered yet.',
      field,
      '@shantanav',
      'Save username',
    );
    if (result == null) return;
    try {
      profile = Map<String, dynamic>.from(
        await api.post('/users', {'address': address, 'username': result}),
      );
      _connectSocket();
      await _loadChats();
      if (mounted) setState(() {});
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _newDm() async {
    if (username.isEmpty) return _claimUsername();
    final field = TextEditingController();
    final result = await _formSheet(
      'New direct message',
      'Search an existing username.',
      field,
      '@username',
      'Send request',
    );
    if (result == null) return;
    try {
      final value = Map<String, dynamic>.from(
        await api.post('/chats/direct', {
          'address': address,
          'username': result,
        }),
      );
      if (value['type'] == 'invite') {
        return _showNotice(
          'Chat request sent to @${value['recipient']['username']}.',
        );
      }
      chats = [value, ...chats.where((item) => item['id'] != value['id'])];
      await _openChat(value);
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _newGroup() async {
    if (username.isEmpty) return _claimUsername();
    final title = TextEditingController();
    final members = TextEditingController();
    final result = await showModalBottomSheet<Map<String, String>>(
      context: _ctx,
      isScrollControlled: true,
      backgroundColor: panel,
      builder: (context) => _Sheet(
        title: 'New group',
        subtitle: 'Enter usernames separated by commas.',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _input(title, 'Weekend trip'),
            const SizedBox(height: 10),
            _input(members, '@alice, @sam'),
            const SizedBox(height: 14),
            _primary(
              'Create group',
              () => Navigator.pop(context, {
                'title': title.text,
                'members': members.text,
              }),
            ),
          ],
        ),
      ),
    );
    if (result == null) return;
    try {
      final value = Map<String, dynamic>.from(
        await api.post('/chats/group', {
          'creator': address,
          'title': result['title'],
          'usernames': result['members']!
              .split(',')
              .map((name) => name.trim())
              .where((name) => name.isNotEmpty)
              .toList(),
        }),
      );
      chats.insert(0, value);
      await _openChat(value);
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _respondInvite(Map<String, dynamic> invite, bool accept) async {
    try {
      final value = Map<String, dynamic>.from(
        await api.post('/chats/requests/${invite['id']}', {
          'address': address,
          'accept': accept,
        }),
      );
      invites.removeWhere((item) => item['id'] == invite['id']);
      if (accept) {
        final accepted = Map<String, dynamic>.from(value['chat']);
        chats.insert(0, accepted);
        await _openChat(accepted);
      }
      if (mounted) setState(() {});
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _sendMessage() async {
    if (composer.text.trim().isEmpty || chat == null) return;
    final text = composer.text.trim();
    composer.clear();
    try {
      await api.post('/messages', {
        'chatId': chat!['id'],
        'sender': username,
        'text': text,
      });
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _createOuting() async {
    final title = TextEditingController();
    final total = TextEditingController();
    final result = await showModalBottomSheet<Map<String, String>>(
      context: _ctx,
      isScrollControlled: true,
      backgroundColor: panel,
      builder: (context) => _Sheet(
        title: 'Create pinned outing',
        subtitle: 'Every group member receives an equal share.',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _input(title, 'Dinner, cab, outing…'),
            const SizedBox(height: 10),
            _input(total, 'Total XLM', decimal: true),
            const SizedBox(height: 14),
            _primary(
              'Create outing',
              () => Navigator.pop(context, {
                'title': title.text,
                'total': total.text,
              }),
            ),
          ],
        ),
      ),
    );
    if (result == null) return;
    try {
      final expense = Map<String, dynamic>.from(
        await api.post('/expenses', {
          'chatId': chat!['id'],
          'creator': address,
          'title': result['title'],
          'total': result['total'],
        }),
      );
      if (!expenses.any((item) => item['id'] == expense['id'])) {
        expenses.insert(0, expense);
      }
      if (mounted) setState(() {});
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  List<Map<String, dynamic>> get recipients {
    if (chat == null) return [];
    if (isGroup) {
      return List<Map<String, dynamic>>.from(
        chat!['members'],
      ).where((member) => member['address'] != address).toList();
    }
    return [Map<String, dynamic>.from(chat!['peer'])];
  }

  Future<void> _createRequest() async {
    final target = await _pickRecipient();
    if (target == null) return;
    final amount = TextEditingController();
    final result = await _formSheet(
      'Request XLM',
      'Requesting from @${target['username']}.',
      amount,
      '0.00 XLM',
      'Send request',
      decimal: true,
    );
    if (result == null) return;
    try {
      final request = Map<String, dynamic>.from(
        await api.post('/requests', {
          'chatId': chat!['id'],
          'payerUsername': target['username'],
          'payee': address,
          'amount': result,
        }),
      );
      if (!requests.any((item) => item['id'] == request['id'])) {
        requests.add(request);
      }
      if (mounted) setState(() {});
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<Map<String, dynamic>?> _pickRecipient() async {
    if (recipients.isEmpty) return null;
    if (recipients.length == 1) return recipients.first;
    return showModalBottomSheet<Map<String, dynamic>>(
      context: _ctx,
      backgroundColor: panel,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: recipients
              .map(
                (member) => ListTile(
                  title: Text('@${member['username']}'),
                  onTap: () => Navigator.pop(context, member),
                ),
              )
              .toList(),
        ),
      ),
    );
  }

  Future<void> _sendPayment() async {
    final target = await _pickRecipient();
    if (target == null) return;
    final amount = TextEditingController();
    final result = await _formSheet(
      'Pay XLM',
      'Sending to @${target['username']}.',
      amount,
      '0.00 XLM',
      'Continue to sign',
      decimal: true,
    );
    if (result != null) await _signedPayment(target['address'], result);
  }

  Future<String?> _signedPayment(String destination, String amount) async {
    try {
      final built = Map<String, dynamic>.from(
        await api.post('/payments/build', {
          'sender': address,
          'destination': destination,
          'amount': amount,
          'chatId': chat!['id'],
        }),
      );
      if (!mounted) return null;
      final xdr = TextEditingController();
      final signed = await showModalBottomSheet<String>(
        context: _ctx,
        isScrollControlled: true,
        backgroundColor: panel,
        builder: (context) => _Sheet(
          title: 'Sign $amount XLM',
          subtitle:
              'Copy the unsigned transaction into your Stellar mobile wallet, then paste the signed XDR.',
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _primary('Copy unsigned XDR', () async {
                await Clipboard.setData(ClipboardData(text: built['xdr']));
              }),
              const SizedBox(height: 10),
              _input(xdr, 'Signed XDR'),
              const SizedBox(height: 14),
              _primary(
                'Submit payment',
                () => Navigator.pop(context, xdr.text),
              ),
            ],
          ),
        ),
      );
      if (signed == null || signed.isEmpty) return null;
      final result = Map<String, dynamic>.from(
        await api.post('/payments/submit', {
          'signedXdr': signed,
          'chatId': chat!['id'],
        }),
      );
      _showNotice('Confirmed: ${result['hash'].toString().substring(0, 10)}…');
      return result['hash'] as String;
    } catch (error) {
      _showNotice(error.toString());
      return null;
    }
  }

  Future<void> _payRequest(Map<String, dynamic> request) async {
    final hash = await _signedPayment(request['payee'], request['amount']);
    if (hash == null) return;
    try {
      await api.post('/requests/${request['id']}/pay', {
        'payer': address,
        'transactionHash': hash,
      });
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  Future<void> _payShare(
    Map<String, dynamic> expense,
    Map<String, dynamic> participant,
  ) async {
    final hash = await _signedPayment(
      expense['creator'],
      participant['amount'],
    );
    if (hash == null) return;
    try {
      await api.post('/expenses/${expense['id']}/pay', {
        'payer': address,
        'transactionHash': hash,
      });
    } catch (error) {
      _showNotice(error.toString());
    }
  }

  void _showNotice(String value) {
    if (!mounted) return;
    ScaffoldMessenger.of(_ctx).showSnackBar(
      SnackBar(
        content: Text(value.replaceFirst('Exception: ', '')),
        backgroundColor: const Color(0xff262626),
      ),
    );
  }

  Future<String?> _formSheet(
    String title,
    String subtitle,
    TextEditingController field,
    String hint,
    String button, {
    bool decimal = false,
  }) => showModalBottomSheet<String>(
    context: _ctx,
    isScrollControlled: true,
    backgroundColor: panel,
    builder: (context) => _Sheet(
      title: title,
      subtitle: subtitle,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _input(field, hint, decimal: decimal),
          const SizedBox(height: 14),
          _primary(button, () => Navigator.pop(context, field.text.trim())),
        ],
      ),
    ),
  );

  TextField _input(
    TextEditingController controller,
    String hint, {
    bool decimal = false,
  }) => TextField(
    controller: controller,
    keyboardType: decimal
        ? const TextInputType.numberWithOptions(decimal: true)
        : TextInputType.text,
    style: const TextStyle(color: Colors.white),
    decoration: InputDecoration(hintText: hint),
  );
  Widget _primary(String label, VoidCallback onPressed) => SizedBox(
    width: double.infinity,
    height: 50,
    child: FilledButton(onPressed: onPressed, child: Text(label)),
  );

  @override
  void dispose() {
    _wallet?.removeListener(_onWalletChange);
    composer.dispose();
    socket?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigatorKey,
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: black,
      colorScheme: const ColorScheme.dark(
        surface: panel,
        primary: Colors.white,
        onPrimary: black,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: Color(0xff111111),
        hintStyle: TextStyle(color: Color(0xff777777)),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: Colors.white),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: black,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    ),
    home: Scaffold(
      drawer: _Drawer(
        profile: profile,
        chats: chats,
        invites: invites,
        onConnect: _connect,
        onDm: _newDm,
        onGroup: _newGroup,
        onChat: _openChat,
        onInvite: _respondInvite,
      ),
      appBar: AppBar(
        titleSpacing: 0,
        backgroundColor: black,
        surfaceTintColor: Colors.transparent,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              chat == null
                  ? 'Your messages'
                  : isGroup
                  ? chat!['title']
                  : '@${chat!['peer']['username']}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            Text(
              chat == null
                  ? 'Social payments'
                  : isGroup
                  ? 'Group chat · payments limited to members'
                  : 'Direct message · payments limited to members',
              style: const TextStyle(
                fontSize: 10,
                color: muted,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
        actions: [
          if (isGroup)
            IconButton(
              onPressed: _createOuting,
              icon: const Icon(Icons.push_pin_outlined),
            ),
          const Padding(
            padding: EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                '● ONLINE',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
      body: _body(),
      bottomNavigationBar: chat == null
          ? null
          : SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _actionRow(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: composer,
                            onSubmitted: (_) => _sendMessage(),
                            decoration: InputDecoration(
                              hintText:
                                  'Message ${isGroup ? chat!['title'] : '@${chat!['peer']['username']}'}',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: _sendMessage,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(50, 50),
                            padding: EdgeInsets.zero,
                          ),
                          child: const Icon(Icons.arrow_upward),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    ),
  );

  Widget _body() {
    if (chat == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white,
                foregroundColor: black,
                child: Text('✦', style: TextStyle(fontSize: 24)),
              ),
              const SizedBox(height: 18),
              const Text(
                'Start a direct message',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                'Search an existing username. Payments are restricted to people in the chat.',
                textAlign: TextAlign.center,
                style: TextStyle(color: muted),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _newDm,
                child: const Text('New direct message'),
              ),
            ],
          ),
        ),
      );
    }
    final entries = <Widget>[
      ...expenses.map(_expenseCard),
      ...messages.map(_messageCard),
      ...requests.map(_requestCard),
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: entries.isEmpty
          ? [
              const Padding(
                padding: EdgeInsets.only(top: 120),
                child: Center(
                  child: Text('Say hello.', style: TextStyle(color: muted)),
                ),
              ),
            ]
          : entries,
    );
  }

  Widget _messageCard(Map<String, dynamic> message) {
    final mine = message['sender'] == username;
    final system = message['type'] == 'system';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: system
              ? const Color(0xff121212)
              : mine
              ? const Color(0xff292929)
              : panel,
          border: Border.all(color: line),
          boxShadow: system
              ? null
              : const [BoxShadow(color: Colors.black, offset: Offset(3, 3))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              system
                  ? 'SYSTEM'
                  : mine
                  ? 'YOU'
                  : '@${message['sender']}',
              style: const TextStyle(
                fontSize: 10,
                letterSpacing: 1.2,
                color: muted,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(message['text'] ?? '', style: const TextStyle(fontSize: 16)),
          ],
        ),
      ),
    );
  }

  Widget _requestCard(Map<String, dynamic> request) {
    final payer = request['payer'] == address;
    final paid = request['status'] == 'paid';
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PAYMENT REQUEST',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.4,
              color: muted,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${request['amount']} XLM',
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            payer
                ? 'Requested from you'
                : 'Requested from @${request['payerUsername']}',
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: paid || !payer ? null : () => _payRequest(request),
              child: Text(
                paid
                    ? 'Paid'
                    : payer
                    ? 'Pay now'
                    : 'Waiting for payment',
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _expenseCard(Map<String, dynamic> expense) => _Card(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'PINNED OUTING · ${expense['totalAmount']} XLM',
          style: const TextStyle(
            fontSize: 10,
            letterSpacing: 1.2,
            color: muted,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          expense['title'],
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 5),
        Text(
          'Split across ${(expense['participants'] as List).length} members.',
          style: const TextStyle(color: muted),
        ),
        const SizedBox(height: 10),
        ...(expense['participants'] as List).map((value) {
          final member = Map<String, dynamic>.from(value);
          final paid = member['paid'] == true;
          final yours = member['address'] == address;
          return Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: line)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '@${member['username']} · ${member['amount']} XLM',
                  ),
                ),
                paid
                    ? Text(
                        member['address'] == expense['creator']
                            ? 'Covered'
                            : 'Paid',
                        style: const TextStyle(
                          color: muted,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : yours
                    ? OutlinedButton(
                        onPressed: () => _payShare(expense, member),
                        child: const Text('Pay share'),
                      )
                    : const Text('Unpaid', style: TextStyle(color: muted)),
              ],
            ),
          );
        }),
      ],
    ),
  );

  Widget _actionRow() => Container(
    color: const Color(0xff101010),
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
    child: Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: isGroup ? _createOuting : _sendPayment,
            icon: Icon(isGroup ? Icons.add : Icons.payments_outlined),
            label: Text(isGroup ? 'Outing' : 'Pay XLM'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: _createRequest,
            icon: const Icon(Icons.request_page_outlined),
            label: const Text('Request XLM'),
          ),
        ),
      ],
    ),
  );
}

class _Drawer extends StatelessWidget {
  const _Drawer({
    required this.profile,
    required this.chats,
    required this.invites,
    required this.onConnect,
    required this.onDm,
    required this.onGroup,
    required this.onChat,
    required this.onInvite,
  });
  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> chats;
  final List<Map<String, dynamic>> invites;
  final VoidCallback onConnect, onDm, onGroup;
  final Future<void> Function(Map<String, dynamic>) onChat;
  final Future<void> Function(Map<String, dynamic>, bool) onInvite;

  @override
  Widget build(BuildContext context) {
    final evmWallet = WalletScope.maybeOf(context);
    final evmReady = evmWallet?.isReady == true;

    return Drawer(
      backgroundColor: panel,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const Text(
              '✦ STELLAR\n   PAY',
              style: TextStyle(
                fontSize: 28,
                height: .78,
                fontWeight: FontWeight.w900,
                letterSpacing: -2,
              ),
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: evmReady ? evmWallet!.openConnectModal : onConnect,
              child: Text(
                evmReady
                    ? 'Connect wallet'
                    : profile == null
                    ? 'Connect wallet'
                    : '@${profile!['username']}',
              ),
            ),
            if (profile != null)
              Padding(
                padding: const EdgeInsets.only(top: 7),
                child: Text(
                  profile!['address'],
                  style: const TextStyle(fontSize: 10, color: muted),
                ),
              ),
            const SizedBox(height: 24),
            const Text(
              'EVM WALLET',
              style: TextStyle(
                fontSize: 10,
                color: muted,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            const EvmWalletControls(),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: onDm,
              icon: const Icon(Icons.add),
              label: const Text('New direct message'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onGroup,
              icon: const Icon(Icons.group_add_outlined),
              label: const Text('New group'),
            ),
            if (invites.isNotEmpty) ...[
              const SizedBox(height: 28),
              const Text(
                'CHAT REQUESTS',
                style: TextStyle(
                  fontSize: 10,
                  color: muted,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w800,
                ),
              ),
              ...invites.map(
                (invite) => Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(border: Border.all(color: line)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('@${invite['username']} wants to chat'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              onPressed: () => onInvite(invite, true),
                              child: const Text('Accept'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => onInvite(invite, false),
                              child: const Text('Reject'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 28),
            const Text(
              'CHATS',
              style: TextStyle(
                fontSize: 10,
                color: muted,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w800,
              ),
            ),
            ...chats.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  item['type'] == 'group'
                      ? item['title']
                      : '@${item['peer']['username']}',
                ),
                onTap: () {
                  Navigator.pop(context);
                  onChat(item);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(15),
    constraints: const BoxConstraints(maxWidth: 460),
    decoration: BoxDecoration(
      color: const Color(0xff202020),
      border: Border.all(color: const Color(0xff666666)),
      boxShadow: const [BoxShadow(color: Colors.black, offset: Offset(4, 4))],
    ),
    child: child,
  );
}

class _Sheet extends StatelessWidget {
  const _Sheet({
    required this.title,
    required this.subtitle,
    required this.child,
  });
  final String title, subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      20,
      20,
      20 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 7),
        Text(subtitle, style: const TextStyle(color: muted)),
        const SizedBox(height: 20),
        child,
      ],
    ),
  );
}
