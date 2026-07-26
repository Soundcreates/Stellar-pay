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
  `);

  const byAddress = db.prepare('SELECT address, username FROM users WHERE address = ?');
  const byUsername = db.prepare('SELECT address, username FROM users WHERE username = ? COLLATE NOCASE');
  const insertUser = db.prepare('INSERT INTO users (address, username) VALUES (?, ?)');
  const byMembers = db.prepare('SELECT id, member_one, member_two FROM chats WHERE member_one = ? AND member_two = ?');
  const membersByChat = db.prepare('SELECT member_one, member_two FROM chats WHERE id = ?');
  const insertChat = db.prepare('INSERT INTO chats (id, member_one, member_two) VALUES (?, ?, ?)');

  return {
    userByAddress: (address) => byAddress.get(address) || null,
    userByUsername: (username) => byUsername.get(username) || null,
    createUser(address, username) {
      insertUser.run(address, username);
      return byAddress.get(address);
    },
    directChat(first, second) {
      const [memberOne, memberTwo] = [first, second].sort();
      return byMembers.get(memberOne, memberTwo) || (() => {
        const chat = { id: crypto.randomUUID(), memberOne, memberTwo };
        insertChat.run(chat.id, chat.memberOne, chat.memberTwo);
        return chat;
      })();
    },
    chatHasMembers(id, first, second) {
      const chat = membersByChat.get(id);
      return Boolean(chat && [chat.member_one, chat.member_two].includes(first) && [chat.member_one, chat.member_two].includes(second));
    },
  };
}
