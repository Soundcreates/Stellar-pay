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

export function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function stroops(amount) {
  const value = requireText(String(amount), 'amount');
  if (!/^\d+(\.\d{1,7})?$/.test(value) || Number(value) <= 0) throw new Error('amount must be a positive XLM value');
  return value;
}

export function toStroops(amount) {
  const [whole, fraction = ''] = stroops(amount).split('.');
  return BigInt(whole) * 10_000_000n + BigInt(`${fraction}0000000`.slice(0, 7));
}

export function toXlm(amount) {
  const whole = amount / 10_000_000n;
  const fraction = (amount % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function username(value) {
  const name = requireText(value, 'username').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('username must be 3–20 letters, numbers, or underscores');
  return name;
}

const corsOptions = { origin: ['http://localhost:5173', 'https://stellar-splitwise-web.vercel.app'] };

export function buildApp({
  store = createStore(),
  horizon = new Horizon.Server(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'),
  logger = false,
} = {}) {
  const app = Fastify({ logger });
  const io = new SocketServer(app.server, { cors: corsOptions });
  const messages = new Map();
  const requests = new Map();

  function send(chatId, event, data) {
    io.to(chatId).emit(event, data);
  }

  app.register(cors, corsOptions);

  app.get('/health', () => ({ ok: true, network: 'testnet' }));

  app.get('/users/address/:address', async (request) => store.userByAddress(request.params.address));

  app.get('/users/lookup/:username', async (request) => store.userByUsername(username(request.params.username)));

  app.get('/chats/user/:address', async (request) => store.chatsFor(request.params.address));
  app.get('/chats/requests/:address', async (request) => store.chatRequestsFor(request.params.address));

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
      const existing = store.existingDirectChat(address, peer.address);
      if (existing) return { ...existing, type: 'direct', peer };
      const invite = store.createChatRequest(address, peer.address);
      return { ...invite, type: 'invite', recipient: peer };
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/chats/requests/:id', async (request, reply) => {
    const result = store.respondToChatRequest(request.params.id, request.body?.address, request.body?.accept === true);
    if (!result) return reply.code(404).send({ error: 'chat request not found' });
    const peer = store.userByAddress(result.invite.sender);
    return { accepted: Boolean(result.chat), chat: result.chat && { ...result.chat, type: 'direct', peer } };
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
  app.get('/chats/:chatId/requests', async (request) => [...requests.values()].filter((payment) => payment.chatId === request.params.chatId));
  app.get('/chats/:chatId/expenses', async (request) => store.expensesForChat(request.params.chatId));

  app.post('/messages', async (request, reply) => {
    try {
      const chatId = requireText(request.body?.chatId, 'chatId');
      const message = {
        id: crypto.randomUUID(),
        chatId,
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
      send(chatId, 'request:new', payment);
      return payment;
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/requests/:id/pay', async (request, reply) => {
    const payment = requests.get(request.params.id);
    if (!payment || payment.payer !== request.body?.payer) return reply.code(404).send({ error: 'payment request not found' });
    payment.status = 'paid';
    payment.transactionHash = requireText(request.body?.transactionHash, 'transactionHash');
    send(payment.chatId, 'request:updated', payment);
    return payment;
  });

  app.post('/expenses', async (request, reply) => {
    try {
      const chatId = requireText(request.body?.chatId, 'chatId');
      const creator = requireText(request.body?.creator, 'creator');
      const members = store.groupMembers(chatId);
      if (!members.some((member) => member.address === creator)) return reply.code(403).send({ error: 'outings can only be created by a group member' });
      const total = toStroops(request.body?.total);
      const share = total / BigInt(members.length);
      const creatorRemainder = total % BigInt(members.length);
      const expense = store.createExpense(chatId, requireText(request.body?.title, 'outing name').slice(0, 40), creator, toXlm(total), members.map((member) => ({ ...member, amount: toXlm(share + (member.address === creator ? creatorRemainder : 0n)) })));
      send(chatId, 'expense:new', expense);
      return expense;
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/expenses/:id/pay', async (request, reply) => {
    try {
      const payer = requireText(request.body?.payer, 'payer');
      const transactionHash = requireText(request.body?.transactionHash, 'transactionHash');
      const expense = store.payExpense(request.params.id, payer, transactionHash);
      if (!expense) return reply.code(404).send({ error: 'outing share not found or already paid' });
      const sender = store.userByAddress(payer);
      const recipient = store.userByAddress(expense.creator);
      const paid = expense.participants.find((participant) => participant.address === payer);
      const message = { id: crypto.randomUUID(), chatId: expense.chatId, sender: 'system', type: 'system', text: `@${sender.username} paid ${paid.amount} XLM to @${recipient.username} → ${transactionHash}`, createdAt: new Date().toISOString() };
      const chat = messages.get(expense.chatId) || [];
      chat.push(message);
      messages.set(expense.chatId, chat);
      send(expense.chatId, 'message:new', message);
      send(expense.chatId, 'expense:updated', expense);
      return expense;
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
      return { hash: result.hash, successful: result.successful };
    } catch (error) {
      return reply.code(400).send({ error: error.response?.data?.extras?.result_codes || error.message });
    }
  });

  io.on('connection', (socket) => {
    socket.on('chat:join', (chatId) => socket.join(chatId));
    socket.on('chat:leave', (chatId) => socket.leave(chatId));
    socket.on('typing', ({ chatId, sender }) => socket.to(chatId).emit('typing', { sender }));
  });

  return { app, io, store };
}
