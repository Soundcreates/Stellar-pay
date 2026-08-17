import { DatabaseSync } from 'node:sqlite';

export function createStore(filename = process.env.DATABASE_PATH || 'stellar-pay.db') {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      member_one TEXT NOT NULL,
      member_two TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_one, member_two)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS chat_requests (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      receiver TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sender, receiver)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS group_chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      creator TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS group_members (
      chat_id TEXT NOT NULL,
      address TEXT NOT NULL,
      PRIMARY KEY (chat_id, address)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      creator TEXT NOT NULL,
      total_amount TEXT NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS expense_participants (
      expense_id TEXT NOT NULL,
      address TEXT NOT NULL,
      amount TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      transaction_hash TEXT,
      PRIMARY KEY (expense_id, address)
    ) STRICT;
  `);

  const byAddress = db.prepare('SELECT address, username FROM users WHERE address = ?');
  const byUsername = db.prepare('SELECT address, username FROM users WHERE username = ? COLLATE NOCASE');
  const insertUser = db.prepare('INSERT INTO users (address, username) VALUES (?, ?)');
  const byMembers = db.prepare('SELECT id, member_one, member_two FROM chats WHERE member_one = ? AND member_two = ?');
  const membersByChat = db.prepare('SELECT member_one, member_two FROM chats WHERE id = ?');
  const insertChat = db.prepare('INSERT INTO chats (id, member_one, member_two) VALUES (?, ?, ?)');
  const requestByMembers = db.prepare('SELECT id, sender, receiver FROM chat_requests WHERE sender = ? AND receiver = ?');
  const requestById = db.prepare('SELECT id, sender, receiver FROM chat_requests WHERE id = ?');
  const insertRequest = db.prepare('INSERT INTO chat_requests (id, sender, receiver) VALUES (?, ?, ?)');
  const deleteRequest = db.prepare('DELETE FROM chat_requests WHERE id = ?');
  const requestsFor = db.prepare('SELECT chat_requests.id, chat_requests.sender, users.username FROM chat_requests JOIN users ON users.address = chat_requests.sender WHERE chat_requests.receiver = ? ORDER BY chat_requests.created_at DESC');
  const insertGroup = db.prepare('INSERT INTO group_chats (id, title, creator) VALUES (?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO group_members (chat_id, address) VALUES (?, ?)');
  const groupHasMembers = db.prepare('SELECT COUNT(DISTINCT address) AS count FROM group_members WHERE chat_id = ? AND address IN (?, ?)');
  const groupMembers = db.prepare('SELECT users.address, users.username FROM group_members JOIN users ON users.address = group_members.address WHERE chat_id = ? ORDER BY users.username');
  const directChatsFor = db.prepare(`SELECT chats.id, users.address, users.username FROM chats JOIN users ON users.address = CASE WHEN chats.member_one = ? THEN chats.member_two ELSE chats.member_one END WHERE chats.member_one = ? OR chats.member_two = ?`);
  const groupChatsFor = db.prepare('SELECT group_chats.id, group_chats.title FROM group_chats JOIN group_members ON group_members.chat_id = group_chats.id WHERE group_members.address = ? ORDER BY group_chats.created_at DESC');
  const insertExpense = db.prepare('INSERT INTO expenses (id, chat_id, title, creator, total_amount) VALUES (?, ?, ?, ?, ?)');
  const insertExpenseParticipant = db.prepare('INSERT INTO expense_participants (expense_id, address, amount, paid) VALUES (?, ?, ?, ?)');
  const expenseById = db.prepare('SELECT id, chat_id AS chatId, title, creator, total_amount AS totalAmount, settled FROM expenses WHERE id = ?');
  const expensesForChat = db.prepare('SELECT id, chat_id AS chatId, title, creator, total_amount AS totalAmount, settled FROM expenses WHERE chat_id = ? AND settled = 0 ORDER BY rowid DESC');
  const expenseParticipants = db.prepare('SELECT expense_participants.address, users.username, expense_participants.amount, expense_participants.paid, expense_participants.transaction_hash AS transactionHash FROM expense_participants JOIN users ON users.address = expense_participants.address WHERE expense_participants.expense_id = ? ORDER BY users.username');
  const expenseParticipant = db.prepare('SELECT paid FROM expense_participants WHERE expense_id = ? AND address = ?');
  const payExpenseParticipant = db.prepare('UPDATE expense_participants SET paid = 1, transaction_hash = ? WHERE expense_id = ? AND address = ?');
  const unpaidExpenseParticipants = db.prepare('SELECT COUNT(*) AS count FROM expense_participants WHERE expense_id = ? AND paid = 0');
  const settleExpense = db.prepare('UPDATE expenses SET settled = 1 WHERE id = ?');

  function withParticipants(expense) {
    return expense && { ...expense, settled: Boolean(expense.settled), participants: expenseParticipants.all(expense.id).map((participant) => ({ ...participant, paid: Boolean(participant.paid) })) };
  }

  return {
    userByAddress: (address) => byAddress.get(address) || null,
    userByUsername: (username) => byUsername.get(username) || null,
    createUser(address, username) {
      insertUser.run(address, username);
      return byAddress.get(address);
    },
    existingDirectChat(first, second) {
      const [memberOne, memberTwo] = [first, second].sort();
      return byMembers.get(memberOne, memberTwo) || null;
    },
    directChat(first, second) {
      const [memberOne, memberTwo] = [first, second].sort();
      return byMembers.get(memberOne, memberTwo) || (() => {
        const chat = { id: crypto.randomUUID(), memberOne, memberTwo };
        insertChat.run(chat.id, chat.memberOne, chat.memberTwo);
        return chat;
      })();
    },
    createChatRequest(sender, receiver) {
      const existing = requestByMembers.get(sender, receiver);
      if (existing) return { ...existing, created: false };
      const invite = { id: crypto.randomUUID(), sender, receiver, created: true };
      insertRequest.run(invite.id, invite.sender, invite.receiver);
      return invite;
    },
    chatRequestsFor: (address) => requestsFor.all(address),
    respondToChatRequest(id, receiver, accept) {
      const invite = requestById.get(id);
      if (!invite || invite.receiver !== receiver) return null;
      deleteRequest.run(id);
      return accept ? { invite, chat: this.directChat(invite.sender, invite.receiver) } : { invite, chat: null };
    },
    chatHasMembers(id, first, second) {
      const chat = membersByChat.get(id);
      if (chat) return [chat.member_one, chat.member_two].includes(first) && [chat.member_one, chat.member_two].includes(second);
      return groupHasMembers.get(id, first, second).count === 2;
    },
    createGroup(title, creator, members) {
      const group = { id: crypto.randomUUID(), title, creator };
      db.exec('BEGIN');
      try {
        insertGroup.run(group.id, title, creator);
        [...new Set([creator, ...members])].forEach((address) => insertMember.run(group.id, address));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return group;
    },
    groupMembers: (id) => groupMembers.all(id),
    createExpense(chatId, title, creator, totalAmount, participants) {
      const expense = { id: crypto.randomUUID(), chatId, title, creator, totalAmount };
      db.exec('BEGIN');
      try {
        insertExpense.run(expense.id, chatId, title, creator, totalAmount);
        participants.forEach((participant) => insertExpenseParticipant.run(expense.id, participant.address, participant.amount, participant.address === creator ? 1 : 0));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return withParticipants(expenseById.get(expense.id));
    },
    expensesForChat: (chatId) => expensesForChat.all(chatId).map(withParticipants),
    payExpense(id, payer, transactionHash) {
      const expense = expenseById.get(id);
      const participant = expenseParticipant.get(id, payer);
      if (!expense || !participant || participant.paid) return null;
      payExpenseParticipant.run(transactionHash, id, payer);
      if (unpaidExpenseParticipants.get(id).count === 0) settleExpense.run(id);
      return withParticipants(expenseById.get(id));
    },
    chatsFor(address) {
      return [
        ...directChatsFor.all(address, address, address).map((chat) => ({ id: chat.id, type: 'direct', peer: { address: chat.address, username: chat.username } })),
        ...groupChatsFor.all(address).map((chat) => ({ ...chat, type: 'group', members: groupMembers.all(chat.id) })),
      ];
    },
  };
}
