import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketServer } from 'socket.io';
import { createStore } from './db.js';
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
const corsOptions = { origin: ['http://localhost:5173', 'https://stellar-splitwise-web.vercel.app'] };
const io = new SocketServer(app.server, { cors: corsOptions });
const horizon = new Horizon.Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
const store = createStore();
const messages = new Map();
const requests = new Map();

await app.register(cors, corsOptions);

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function stroops(amount) {
  const value = requireText(String(amount), 'amount');
  if (!/^\d+(\.\d{1,7})?$/.test(value) || Number(value) <= 0) throw new Error('amount must be a positive XLM value');
  return value;
}

function username(value) {
  const name = requireText(value, 'username').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('username must be 3–20 letters, numbers, or underscores');
  return name;
}

function send(chatId, event, data) {
  io.to(chatId).emit(event, data);
}

app.get('/health', () => ({ ok: true, network: 'testnet' }));

app.get('/users/address/:address', async (request) => store.userByAddress(request.params.address));

app.get('/users/lookup/:username', async (request) => store.userByUsername(username(request.params.username)));

app.get('/chats/user/:address', async (request) => store.chatsFor(request.params.address));

app.post('/users', async (request, reply) => {
  try {
    const address = requireText(request.body?.address, 'address');
    if (store.userByAddress(address)) return reply.code(409).send({ error: 'this wallet already has a username' });
    const name = username(request.body?.username);
    if (store.userByUsername(name)) return reply.code(409).send({ error: 'username is already taken' });
    return store.createUser(address, name);
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

app.post('/chats/direct', async (request, reply) => {
  try {
    const address = requireText(request.body?.address, 'address');
    if (!store.userByAddress(address)) return reply.code(403).send({ error: 'create a username before starting chats' });
    const peer = store.userByUsername(username(request.body?.username));
    if (!peer) return reply.code(404).send({ error: 'username not found' });
    if (peer.address === address) return reply.code(400).send({ error: 'you cannot message yourself' });
    return { ...store.directChat(address, peer.address), type: 'direct', peer };
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

app.post('/chats/group', async (request, reply) => {
  try {
    const creator = requireText(request.body?.creator, 'creator');
    if (!store.userByAddress(creator)) return reply.code(403).send({ error: 'create a username before starting chats' });
    const title = requireText(request.body?.title, 'group name').slice(0, 40);
    const names = [...new Set((request.body?.usernames || []).map(username))];
    if (!names.length) return reply.code(400).send({ error: 'add at least one username' });
    const members = names.map((name) => store.userByUsername(name));
    if (members.some((member) => !member)) return reply.code(404).send({ error: 'one or more usernames were not found' });
    if (!members.some((member) => member.address !== creator)) return reply.code(400).send({ error: 'add at least one other person' });
    const group = store.createGroup(title, creator, members.map((member) => member.address));
    return { ...group, type: 'group', members: store.groupMembers(group.id) };
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

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
    const chatId = requireText(request.body?.chatId, 'chatId');
    const payer = store.userByUsername(username(request.body?.payerUsername));
    if (!payer) return reply.code(404).send({ error: 'payer username not found' });
    const payee = requireText(request.body?.payee, 'payee');
    if (!store.chatHasMembers(chatId, payer.address, payee)) return reply.code(403).send({ error: 'payments are limited to people in this chat' });
    const payment = {
      id: crypto.randomUUID(),
      chatId,
      payer: payer.address,
      payerUsername: payer.username,
      payee,
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
    const chatId = requireText(request.body?.chatId, 'chatId');
    const amount = stroops(request.body?.amount);
    if (!store.chatHasMembers(chatId, sender, destination)) return reply.code(403).send({ error: 'payments are limited to people in this chat' });
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
