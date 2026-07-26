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
  `);

  const byAddress = db.prepare('SELECT address, username FROM users WHERE address = ?');
  const byUsername = db.prepare('SELECT address, username FROM users WHERE username = ? COLLATE NOCASE');
  const insertUser = db.prepare('INSERT INTO users (address, username) VALUES (?, ?)');
  const byMembers = db.prepare('SELECT id, member_one, member_two FROM chats WHERE member_one = ? AND member_two = ?');
  const membersByChat = db.prepare('SELECT member_one, member_two FROM chats WHERE id = ?');
  const insertChat = db.prepare('INSERT INTO chats (id, member_one, member_two) VALUES (?, ?, ?)');
  const insertGroup = db.prepare('INSERT INTO group_chats (id, title, creator) VALUES (?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO group_members (chat_id, address) VALUES (?, ?)');
  const groupHasMembers = db.prepare('SELECT COUNT(DISTINCT address) AS count FROM group_members WHERE chat_id = ? AND address IN (?, ?)');
  const groupMembers = db.prepare('SELECT users.address, users.username FROM group_members JOIN users ON users.address = group_members.address WHERE chat_id = ? ORDER BY users.username');
  const directChatsFor = db.prepare(`SELECT chats.id, users.address, users.username FROM chats JOIN users ON users.address = CASE WHEN chats.member_one = ? THEN chats.member_two ELSE chats.member_one END WHERE chats.member_one = ? OR chats.member_two = ?`);
  const groupChatsFor = db.prepare('SELECT group_chats.id, group_chats.title FROM group_chats JOIN group_members ON group_members.chat_id = group_chats.id WHERE group_members.address = ? ORDER BY group_chats.created_at DESC');

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
    chatsFor(address) {
      return [
        ...directChatsFor.all(address, address, address).map((chat) => ({ id: chat.id, type: 'direct', peer: { address: chat.address, username: chat.username } })),
        ...groupChatsFor.all(address).map((chat) => ({ ...chat, type: 'group', members: groupMembers.all(chat.id) })),
      ];
    },
  };
}
