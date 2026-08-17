import { useEffect, useRef, useState } from 'react';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { io } from 'socket.io-client';

const API = 'https://stellar-splitwise.onrender.com';

export default function App() {
  const socket = useRef();
  const activeChat = useRef(null);
  const [profile, setProfile] = useState(null);
  const [setup, setSetup] = useState(false);
  const [username, setUsername] = useState('');
  const [chatQuery, setChatQuery] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupUsers, setGroupUsers] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  const [chat, setChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    socket.current = io(API, { transports: ['websocket'], reconnectionAttempts: 3 });
    socket.current.on('message:new', (message) => activeChat.current?.id === message.chatId && setMessages((all) => [...all, message]));
    socket.current.on('request:new', (request) => activeChat.current?.id === request.chatId && setRequests((all) => all.some((item) => item.id === request.id) ? all : [...all, request]));
    socket.current.on('request:updated', (request) => activeChat.current?.id === request.chatId && setRequests((all) => all.map((item) => item.id === request.id ? request : item)));
    socket.current.on('expense:new', (expense) => activeChat.current?.id === expense.chatId && setExpenses((all) => all.some((item) => item.id === expense.id) ? all : [expense, ...all]));
    socket.current.on('expense:updated', (expense) => activeChat.current?.id === expense.chatId && setExpenses((all) => expense.settled ? all.filter((item) => item.id !== expense.id) : all.map((item) => item.id === expense.id ? expense : item)));
    return () => socket.current.close();
  }, []);

  useEffect(() => {
    setMessages([]);
    setRequests([]);
    setExpenses([]);
    activeChat.current = chat;
    if (!chat) return;
    socket.current?.emit('chat:join', chat.id);
    fetch(`${API}/chats/${chat.id}/messages`).then((r) => r.json()).then(setMessages).catch(() => {});
    fetch(`${API}/chats/${chat.id}/requests`).then((r) => r.json()).then(setRequests).catch(() => {});
    fetch(`${API}/chats/${chat.id}/expenses`).then((r) => r.json()).then(setExpenses).catch(() => {});
    return () => socket.current?.emit('chat:leave', chat.id);
  }, [chat]);

  useEffect(() => {
    if (!chat) return;
    const peers = chat.type === 'group' ? chat.members.filter((member) => member.address !== profile?.address) : [chat.peer];
    setRecipient(peers[0]?.username || '');
  }, [chat, profile?.address]);

  useEffect(() => {
    if (!profile?.username) return;
    fetch(`${API}/chats/user/${profile.address}`).then((response) => response.json()).then(setChats).catch(() => {});
    fetch(`${API}/chats/requests/${profile.address}`).then((response) => response.json()).then(setInvites).catch(() => {});
  }, [profile]);

  async function connect() {
    try {
      const freighterConnected = await Promise.race([
        isConnected(),
        new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
      ]);
      if (!freighterConnected) return setNotice('Install Freighter to sign Stellar testnet payments.');
      const { address, error } = await requestAccess();
      if (error) return setNotice(error);
      const user = await fetch(`${API}/users/address/${address}`).then((r) => r.json());
      if (user) setProfile(user);
      else { setProfile({ address }); setSetup(true); }
    } catch {
      setNotice('Unable to reach the backend. Check that the Render service is running.');
    }
  }

  async function claimUsername(event) {
    event.preventDefault();
    const response = await fetch(`${API}/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: profile.address, username }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setProfile(data);
    setSetup(false);
  }

  async function openChat(event) {
    event.preventDefault();
    if (!profile?.username) return setNotice('Connect your wallet and choose a username first.');
    const response = await fetch(`${API}/chats/direct`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: profile.address, username: chatQuery }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    if (data.type === 'invite') return setNotice(data.created ? `Chat request sent to @${data.recipient.username}.` : `Your request to @${data.recipient.username} is pending.`);
    setChat(data);
    setChats((all) => [data, ...all.filter((item) => item.id !== data.id)]);
    setChatQuery('');
  }

  async function respondToInvite(invite, accept) {
    const response = await fetch(`${API}/chats/requests/${invite.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: profile.address, accept }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setInvites((all) => all.filter((item) => item.id !== invite.id));
    if (!accept) return;
    setChats((all) => [data.chat, ...all.filter((item) => item.id !== data.chat.id)]);
    setChat(data.chat);
  }

  async function createGroup(event) {
    event.preventDefault();
    if (!profile?.username) return setNotice('Connect your wallet and choose a username first.');
    const response = await fetch(`${API}/chats/group`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ creator: profile.address, title: groupTitle, usernames: groupUsers.split(',').map((name) => name.trim()).filter(Boolean) }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setChat(data);
    setChats((all) => [data, ...all.filter((item) => item.id !== data.id)]);
    setGroupTitle('');
    setGroupUsers('');
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!text.trim() || !chat || !profile) return;
    const response = await fetch(`${API}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: chat.id, sender: profile.username, text }) });
    if (!response.ok) setNotice((await response.json()).error);
    setText('');
  }

  async function submitPayment(destination, paymentAmount) {
    if (!profile) return setNotice('Connect the paying wallet first.');
    const built = await fetch(`${API}/payments/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: profile.address, destination, amount: paymentAmount, chatId: chat.id }) }).then((r) => r.json());
    if (built.error) throw new Error(built.error);
    const signed = await signTransaction(built.xdr, { networkPassphrase: built.networkPassphrase });
    if (signed.error) throw new Error(signed.error);
    const result = await fetch(`${API}/payments/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedXdr: signed.signedTxXdr, chatId: chat.id }) }).then((r) => r.json());
    if (result.error) throw new Error(JSON.stringify(result.error));
    setNotice(`Confirmed: ${result.hash.slice(0, 10)}…`);
    return result;
  }

  async function directPay(event) {
    event.preventDefault();
    try { await submitPayment(selectedRecipient.address, amount); setAmount(''); }
    catch (error) { setNotice(error.message); }
  }

  async function createRequest() {
    const response = await fetch(`${API}/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: chat.id, payerUsername: selectedRecipient.username, payee: profile.address, amount }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setRequests((all) => [...all, data]);
    setAmount('');
  }

  async function createExpense(event) {
    event.preventDefault();
    const response = await fetch(`${API}/expenses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: chat.id, creator: profile.address, title: expenseTitle, total: expenseTotal }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setExpenses((all) => all.some((item) => item.id === data.id) ? all : [data, ...all]);
    setExpenseTitle('');
    setExpenseTotal('');
  }

  async function payExpense(expense, participant) {
    try {
      const result = await submitPayment(expense.creator, participant.amount);
      const updated = await fetch(`${API}/expenses/${expense.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payer: profile.address, transactionHash: result.hash }) }).then((response) => response.json());
      if (updated.error) throw new Error(updated.error);
    } catch (error) { setNotice(error.message); }
  }

  async function payRequest(request) {
    try {
      const result = await submitPayment(request.payee, request.amount);
      const updated = await fetch(`${API}/requests/${request.id}/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payer: profile.address, transactionHash: result.hash }) }).then((response) => response.json());
      if (updated.error) throw new Error(updated.error);
    } catch (error) { setNotice(error.message); }
  }

  const recipients = chat ? (chat.type === 'group' ? chat.members.filter((member) => member.address !== profile?.address) : [chat.peer]) : [];
  const selectedRecipient = recipients.find((member) => member.username === recipient) || recipients[0];
  const title = !chat ? 'Your messages' : chat.type === 'group' ? chat.title : `@${chat.peer.username}`;
  return <>
    <main>
      <aside>
        <div className="brand"><span className="mark">✦</span> STELLAR<br /><span>PAY</span></div>
        <div className="identity"><button className="wallet" onClick={connect}>{profile?.username ? `@${profile.username}` : 'Connect wallet'}</button>{profile?.address && <small title={profile.address}>{profile.address}</small>}</div>
        <form className="new-chat" onSubmit={openChat}><label>NEW DIRECT MESSAGE<input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="@username" /></label><button>+</button></form>
        <form className="new-group" onSubmit={createGroup}><label>NEW GROUP<input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Weekend trip" /></label><input value={groupUsers} onChange={(e) => setGroupUsers(e.target.value)} placeholder="@alice, @sam" /><button>Create group</button></form>
        {invites.length > 0 && <div className="invites"><small>CHAT REQUESTS</small>{invites.map((invite) => <div key={invite.id}><span>@{invite.username} wants to chat</span><button onClick={() => respondToInvite(invite, true)}>Accept</button><button onClick={() => respondToInvite(invite, false)}>Reject</button></div>)}</div>}
        <p>TESTNET · Native XLM</p>
        <nav><small>CHATS</small>{chats.length ? chats.map((item) => <button className={item.id === chat?.id ? 'chat-item active' : 'chat-item'} key={item.id} onClick={() => setChat(item)}>{item.type === 'group' ? item.title : `@${item.peer.username}`}</button>) : <span>No chats yet</span>}</nav>
      </aside>
      <section>
        <header><div><small className="eyebrow">SOCIAL PAYMENTS</small><h1>{title}</h1><small>{chat ? `${chat.type === 'group' ? 'Group chat' : 'Direct message'} · payments limited to members` : 'Search a username to begin'}</small></div><div className="status"><i />Online</div></header>
        <div className="thread">
          {!chat && <div className="empty"><span>✦</span><h2>Start a direct message</h2><p>Search an existing @username. Payments are restricted to the person in the chat.</p></div>}
          {chat && !messages.length && !requests.length && !expenses.length && <div className="empty"><span>✦</span><h2>Say hello to {title}</h2><p>Send a message, request XLM, or pay a member directly.</p></div>}
          {expenses.map((expense) => <article className="expense" key={expense.id}><small>PINNED OUTING · {expense.totalAmount} XLM</small><h2>{expense.title}</h2><p>Split across {expense.participants.length} members. The creator is marked covered.</p>{expense.participants.map((participant) => <div className="expense-member" key={participant.address}><span>@{participant.username} · {participant.amount} XLM</span>{participant.paid ? <b>{participant.address === expense.creator ? 'Covered' : 'Paid'}</b> : participant.address === profile?.address ? <button onClick={() => payExpense(expense, participant)}>Pay share</button> : <b>Unpaid</b>}</div>)}</article>)}
          {messages.map((message) => <article className={`${message.sender === profile?.username ? 'mine ' : ''}${message.type === 'system' ? 'system' : ''}`} key={message.id}><small>{message.type === 'system' ? 'SYSTEM' : message.sender === profile?.username ? 'You' : `@${message.sender}`}</small><p>{message.text}</p></article>)}
          {requests.map((request) => <article className="request" key={request.id}><small>PAYMENT REQUEST</small><strong>{request.amount} XLM</strong><p>{request.payer === profile?.address ? 'Requested from you' : `Requested from @${request.payerUsername}`}</p><button disabled={request.status === 'paid' || request.payer !== profile?.address} onClick={() => payRequest(request)}>{request.status === 'paid' ? 'Paid' : request.payer === profile?.address ? 'Pay now' : 'Waiting for payment'}</button></article>)}
        </div>
        {notice && <div className="notice">{notice}</div>}
        {chat?.type === 'group' && <form className="expense-form" onSubmit={createExpense}><label><span>CREATE PINNED OUTING</span><input value={expenseTitle} onChange={(event) => setExpenseTitle(event.target.value)} placeholder="Dinner, cab, outing…" /></label><label><span>TOTAL XLM</span><input value={expenseTotal} onChange={(event) => setExpenseTotal(event.target.value)} inputMode="decimal" placeholder="0.00" /></label><button>Create outing</button></form>}
        {chat && selectedRecipient && <form className="payment-actions" onSubmit={directPay}><label><span>{chat.type === 'group' ? 'GROUP MEMBER' : 'CHAT MEMBER'}</span>{chat.type === 'group' ? <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>{recipients.map((member) => <option key={member.address} value={member.username}>@{member.username}</option>)}</select> : <input readOnly value={`@${selectedRecipient.username}`} />}</label><label><span>AMOUNT</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00 XLM" /></label><button>Pay</button><button type="button" onClick={createRequest}>Request</button></form>}
        {chat && <form className="composer" onSubmit={sendMessage}><input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${title}`} /><button aria-label="Send message">↑</button></form>}
      </section>
    </main>
    {setup && <div className="modal"><form onSubmit={claimUsername}><small>ONE-TIME SETUP</small><h2>Claim your username</h2><p>It is linked to this wallet and lets friends find and pay you.</p><input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@shantanav" /><button>Save username</button></form></div>}
  </>;
}
