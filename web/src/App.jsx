import { useEffect, useRef, useState } from 'react';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3100';

export default function App() {
  const socket = useRef();
  const [profile, setProfile] = useState(null);
  const [setup, setSetup] = useState(false);
  const [username, setUsername] = useState('');
  const [chatQuery, setChatQuery] = useState('');
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    socket.current = io(API);
    socket.current.on('message:new', (message) => setMessages((all) => [...all, message]));
    socket.current.on('payment:request', (payment) => setRequests((all) => [...all, payment]));
    socket.current.on('payment:confirmed', ({ hash }) => setNotice(`Confirmed: ${hash.slice(0, 10)}…`));
    return () => socket.current.close();
  }, []);

  useEffect(() => {
    setMessages([]);
    setRequests([]);
    if (!chat) return;
    socket.current?.emit('chat:join', chat.id);
    fetch(`${API}/chats/${chat.id}/messages`).then((r) => r.json()).then(setMessages).catch(() => {});
  }, [chat]);

  async function connect() {
    if (!await isConnected()) return setNotice('Install Freighter to sign Stellar testnet payments.');
    const { address, error } = await requestAccess();
    if (error) return setNotice(error);
    const user = await fetch(`${API}/users/address/${address}`).then((r) => r.json());
    if (user) setProfile(user);
    else { setProfile({ address }); setSetup(true); }
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
    setChat(data);
    setChatQuery('');
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
  }

  async function directPay(event) {
    event.preventDefault();
    try { await submitPayment(chat.peer.address, amount); setAmount(''); }
    catch (error) { setNotice(error.message); }
  }

  async function createRequest() {
    const response = await fetch(`${API}/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: chat.id, payerUsername: chat.peer.username, payee: profile.address, amount }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setAmount('');
  }

  async function payRequest(request) {
    try {
      await submitPayment(request.payee, request.amount);
      setRequests((all) => all.map((item) => item.id === request.id ? { ...item, status: 'paid' } : item));
    } catch (error) { setNotice(error.message); }
  }

  const title = chat ? `@${chat.peer.username}` : 'Your messages';
  return <>
    <main>
      <aside>
        <div className="brand"><span className="mark">✦</span> STELLAR<br /><span>PAY</span></div>
        <button className="wallet" onClick={connect}>{profile?.username ? `@${profile.username}` : 'Connect wallet'}</button>
        <form className="new-chat" onSubmit={openChat}><label>NEW DIRECT MESSAGE<input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="@username" /></label><button>+</button></form>
        <p>TESTNET · Native XLM</p>
        <nav><small>CHATS</small><b>{chat ? title : 'No chat selected'}</b><span>● online now</span></nav>
      </aside>
      <section>
        <header><div><small className="eyebrow">SOCIAL PAYMENTS</small><h1>{title}</h1><small>{chat ? 'Direct message · payments limited to this chat' : 'Search a username to begin'}</small></div><div className="status"><i />Online</div></header>
        <div className="thread">
          {!chat && <div className="empty"><span>✦</span><h2>Start a direct message</h2><p>Search an existing @username. Payments are restricted to the person in the chat.</p></div>}
          {chat && !messages.length && !requests.length && <div className="empty"><span>✦</span><h2>Say hello to {title}</h2><p>Send a message, request XLM, or pay them directly.</p></div>}
          {messages.map((message) => <article className={message.sender === profile?.username ? 'mine' : ''} key={message.id}><small>{message.sender === profile?.username ? 'You' : `@${message.sender}`}</small><p>{message.text}</p></article>)}
          {requests.map((request) => <article className="request" key={request.id}><small>PAYMENT REQUEST</small><strong>{request.amount} XLM</strong><p>{request.payer === profile?.address ? 'Requested from you' : `Requested from @${request.payerUsername}`}</p><button disabled={request.status === 'paid' || request.payer !== profile?.address} onClick={() => payRequest(request)}>{request.status === 'paid' ? 'Paid' : request.payer === profile?.address ? 'Pay now' : 'Waiting for payment'}</button></article>)}
        </div>
        {notice && <div className="notice">{notice}</div>}
        {chat && <form className="payment-actions" onSubmit={directPay}><label><span>PAY {title.toUpperCase()}</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00 XLM" /></label><button>Pay</button><button type="button" onClick={createRequest}>Request</button></form>}
        {chat && <form className="composer" onSubmit={sendMessage}><input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${title}`} /><button aria-label="Send message">↑</button></form>}
      </section>
    </main>
    {setup && <div className="modal"><form onSubmit={claimUsername}><small>ONE-TIME SETUP</small><h2>Claim your username</h2><p>It is linked to this wallet and lets friends find and pay you.</p><input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@shantanav" /><button>Save username</button></form></div>}
  </>;
}
