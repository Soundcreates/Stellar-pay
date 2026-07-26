import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketServer } from 'socket.io';
import {
  Account,
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

const app = Fastify({ logger: true });
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const io = new SocketServer(app.server, { cors: { origin: webOrigin } });
const horizon = new Horizon.Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
const messages = new Map();
const requests = new Map();

await app.register(cors, { origin: webOrigin });

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function stroops(amount) {
  const value = requireText(String(amount), 'amount');
  if (!/^\d+(\.\d{1,7})?$/.test(value) || Number(value) <= 0) throw new Error('amount must be a positive XLM value');
  return value;
}

function send(chatId, event, data) {
  io.to(chatId).emit(event, data);
}

app.get('/health', () => ({ ok: true, network: 'testnet' }));

app.get('/chats/:chatId/messages', async (request) => messages.get(request.params.chatId) || []);

app.post('/messages', async (request, reply) => {
  try {
    const chatId = requireText(request.body?.chatId, 'chatId');
    const message = {
      id: crypto.randomUUID(),
      sender: requireText(request.body?.sender, 'sender'),
      text: requireText(request.body?.text, 'text'),
      createdAt: new Date().toISOString(),
      type: 'text',
    };
    const chat = messages.get(chatId) || [];
    chat.push(message);
    messages.set(chatId, chat);
    send(chatId, 'message:new', message);
    return message;
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

app.post('/requests', async (request, reply) => {
  try {
    const payment = {
      id: crypto.randomUUID(),
      chatId: requireText(request.body?.chatId, 'chatId'),
      payer: requireText(request.body?.payer, 'payer'),
      payee: requireText(request.body?.payee, 'payee'),
      amount: stroops(request.body?.amount),
      status: 'open',
      type: 'request',
    };
    requests.set(payment.id, payment);
    send(payment.chatId, 'payment:request', payment);
    return payment;
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

// Builds an unsigned native-XLM transfer. Freighter signs it; this server never receives a secret key.
app.post('/payments/build', async (request, reply) => {
  try {
    const sender = requireText(request.body?.sender, 'sender');
    const destination = requireText(request.body?.destination, 'destination');
    const amount = stroops(request.body?.amount);
    const account = await horizon.loadAccount(sender);
    const tx = new TransactionBuilder(new Account(account.accountId(), account.sequenceNumber()), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount }))
      .setTimeout(60)
      .build();
    return { xdr: tx.toXDR(), networkPassphrase: Networks.TESTNET };
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

app.post('/payments/submit', async (request, reply) => {
  try {
    const tx = TransactionBuilder.fromXDR(requireText(request.body?.signedXdr, 'signedXdr'), Networks.TESTNET);
    const result = await horizon.submitTransaction(tx);
    const payment = { hash: result.hash, successful: result.successful };
    if (request.body?.chatId) send(request.body.chatId, 'payment:confirmed', payment);
    return payment;
  } catch (error) {
    return reply.code(400).send({ error: error.response?.data?.extras?.result_codes || error.message });
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', (chatId) => socket.join(chatId));
  socket.on('typing', ({ chatId, sender }) => socket.to(chatId).emit('typing', { sender }));
});

await app.listen({ port: Number(process.env.PORT || 3100), host: '0.0.0.0' });
