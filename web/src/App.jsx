import { useEffect, useState } from 'react';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3100';
const CHAT_ID = 'demo';

export default function App() {
  const [wallet, setWallet] = useState('');
  const [text, setText] = useState('');
  const [payer, setPayer] = useState('');
  const [amount, setAmount] = useState('');
  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch(`${API}/chats/${CHAT_ID}/messages`).then((r) => r.json()).then(setMessages).catch(() => {});
    const socket = io(API);
    socket.emit('chat:join', CHAT_ID);
    socket.on('message:new', (message) => setMessages((all) => [...all, message]));
    socket.on('payment:request', (payment) => setRequests((all) => [...all, payment]));
    socket.on('payment:confirmed', ({ hash }) => setNotice(`Confirmed: ${hash.slice(0, 10)}…`));
    return () => socket.close();
  }, []);

  async function connect() {
    const connected = await isConnected();
    if (!connected) return setNotice('Install Freighter to sign Stellar testnet payments.');
    const { address, error } = await requestAccess();
    if (error) return setNotice(error);
    setWallet(address);
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!text.trim()) return;
    const response = await fetch(`${API}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: CHAT_ID, sender: wallet || 'guest', text }) });
    if (!response.ok) setNotice((await response.json()).error);
    setText('');
  }

  async function createRequest(event) {
    event.preventDefault();
    if (!wallet) return setNotice('Connect the receiving wallet first.');
    const response = await fetch(`${API}/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: CHAT_ID, payer, payee: wallet, amount }) });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error);
    setAmount('');
  }

  async function pay(request) {
    if (!wallet) return setNotice('Connect the paying wallet first.');
    try {
      const built = await fetch(`${API}/payments/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: wallet, destination: request.payee, amount: request.amount }) }).then((r) => r.json());
      if (built.error) throw new Error(built.error);
      const signed = await signTransaction(built.xdr, { networkPassphrase: built.networkPassphrase });
      if (signed.error) throw new Error(signed.error);
      const result = await fetch(`${API}/payments/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedXdr: signed.signedTxXdr, chatId: CHAT_ID }) }).then((r) => r.json());
      if (result.error) throw new Error(JSON.stringify(result.error));
      setRequests((all) => all.map((item) => item.id === request.id ? { ...item, status: 'paid' } : item));
    } catch (error) {
      setNotice(error.message);
    }
  }

  return <main>
    <aside>
      <div className="brand"><span className="mark">✦</span> STELLAR<br /><span>PAY</span></div>
      <button className="wallet" onClick={connect}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Connect wallet'}</button>
      <p>TESTNET · Native XLM</p>
      <nav><small>CHATS</small><b>Demo room</b><span>● online now</span></nav>
    </aside>
    <section>
      <header><div><small className="eyebrow">SOCIAL PAYMENTS</small><h1>Demo room</h1><small>Live messages and testnet XLM</small></div><div className="status"><i />Online</div></header>
      <div className="thread">
        {!messages.length && !requests.length && <div className="empty"><span>✦</span><h2>Start the conversation</h2><p>Send a message, request XLM, or pay directly from a chat card.</p></div>}
        {messages.map((message) => <article className={message.sender === wallet ? 'mine' : ''} key={message.id}><small>{message.sender === wallet ? 'You' : message.sender}</small><p>{message.text}</p></article>)}
        {requests.map((request) => <article className="request" key={request.id}><small>PAYMENT REQUEST</small><strong>{request.amount} XLM</strong><p>To {request.payee.slice(0, 6)}…{request.payee.slice(-4)}</p><button disabled={request.status === 'paid'} onClick={() => pay(request)}>{request.status === 'paid' ? 'Paid' : 'Pay now'}</button></article>)}
      </div>
      {notice && <div className="notice">{notice}</div>}
      <form className="request-form" onSubmit={createRequest}><label><span>REQUEST XLM</span><input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Payer Stellar address" /></label><label><span>AMOUNT</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></label><button>Request</button></form>
      <form className="composer" onSubmit={sendMessage}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" /><button aria-label="Send message">↑</button></form>
    </section>
  </main>;
}
