import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import chatShot from './assets/screenshots/chat.svg';
import requestShot from './assets/screenshots/request.svg';
import splitShot from './assets/screenshots/split.svg';
import sidebarShot from './assets/screenshots/sidebar.svg';
import walletShot from './assets/screenshots/wallet.svg';
import './marketing.css';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const RELEASE = 'https://github.com/Soundcreates/Stellar-pay/releases/latest';
const RELEASE_APK = `${RELEASE}/download/stellar-pay.apk`;

const features = [
  {
    number: '01',
    title: 'Pay in the thread',
    body: 'Send native XLM to a chat member without leaving the conversation or copying a long address.',
    icon: '↗',
    shot: chatShot,
    shotAlt: 'Stellar Pay chat with a confirmed 12 XLM payment',
  },
  {
    number: '02',
    title: 'Ask without the awkwardness',
    body: 'Request an exact amount in context, then settle it with one wallet approval.',
    icon: '◌',
    shot: requestShot,
    shotAlt: 'Stellar Pay payment request card in a direct message',
  },
  {
    number: '03',
    title: 'Split the whole outing',
    body: 'Create a pinned expense for the group and give everyone a clear, even share to pay.',
    icon: '÷',
    shot: splitShot,
    shotAlt: 'Stellar Pay pinned outing split across four members',
  },
  {
    number: '04',
    title: 'Find people by username',
    body: 'Use a simple @username connected to a Stellar address instead of passing around wallet strings.',
    icon: '@',
    shot: sidebarShot,
    shotAlt: 'Stellar Pay sidebar with a claimed username and chat list',
  },
  {
    number: '05',
    title: 'Stay in sync',
    body: 'Messages, payment requests, and expense updates appear in the same real-time thread.',
    icon: '✦',
    shot: chatShot,
    shotAlt: 'Stellar Pay live thread with messages and settlement status',
  },
];

const gallery = [
  { src: chatShot, label: 'Chat + pay', caption: 'Send XLM in the same thread as the plan.' },
  { src: requestShot, label: 'Request', caption: 'Ask for an exact amount without leaving context.' },
  { src: splitShot, label: 'Pinned outing', caption: 'Split a group expense and see who still owes.' },
  { src: sidebarShot, label: 'Usernames', caption: 'Find people by @username, not a G… string.' },
  { src: walletShot, label: 'Wallet', caption: 'Connect, claim a name, sign locally.' },
];

const steps = [
  ['01', 'Connect a wallet', 'Use Freighter on the web or the mobile wallet flow to bring your Stellar identity with you.'],
  ['02', 'Start the conversation', 'Find a username, open a direct chat, or create a group for the people sharing the expense.'],
  ['03', 'Move the money', 'Pay, request, or settle a split. Your wallet signs the transaction locally before it reaches Stellar.'],
];

const whyChips = [
  ['✦', 'Wallet-native', 'Sign every payment yourself'],
  ['◎', 'Non-custodial', 'Your keys stay with you'],
  ['↗', 'Real settlement', 'Native XLM on Stellar'],
  ['◌', 'One shared thread', 'Conversation meets context'],
];

function Brand({ compact = false }) {
  return (
    <a className={compact ? 'marketing-brand compact' : 'marketing-brand'} href="/" aria-label="Stellar Pay home">
      <span className="brand-mark">✦</span>
      <span>STELLAR</span>
      <span>PAY</span>
    </a>
  );
}

function ProductShot({ src, alt }) {
  return <img src={src} alt={alt} />;
}

export default function LandingPage() {
  const root = useRef(null);
  const lenisRef = useRef(null);

  useGSAP(() => {
    const node = root.current;
    if (!node) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onAnchorClick = (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href');
      const target = id && id !== '#' ? document.querySelector(id) : null;
      if (!target) return;
      event.preventDefault();
      if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 0.85, offset: -12 });
      else target.scrollIntoView({ behavior: 'smooth' });
    };
    node.addEventListener('click', onAnchorClick);

    if (reduced) {
      return () => node.removeEventListener('click', onAnchorClick);
    }

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, autoRaf: false });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    gsap.from('.hero-copy .eyebrow, .hero-copy h1, .hero-lede, .hero-actions a, .hero-note', {
      y: 28,
      opacity: 0,
      duration: 0.72,
      stagger: 0.08,
      ease: 'power3.out',
    });
    gsap.from('.hero-shot', { y: 36, opacity: 0, scale: 0.96, duration: 0.9, ease: 'power3.out' });

    ScrollTrigger.create({
      start: 0,
      onUpdate: (self) => node.classList.toggle('nav-compact', self.scroll() > 28),
    });

    const enter = { start: 'top 92%', toggleActions: 'play none none none' };

    gsap.from('.why-chip', {
      scrollTrigger: { trigger: '.why-section', ...enter },
      y: 20,
      opacity: 0,
      duration: 0.5,
      stagger: 0.08,
      ease: 'power2.out',
    });

    const frames = gsap.utils.toArray('.gallery-frame');
    const labels = gsap.utils.toArray('.gallery-label');
    const canPin = window.matchMedia('(min-width: 761px)').matches;
    if (canPin && frames.length > 1) {
      gsap.set(frames, { autoAlpha: 0 });
      gsap.set(frames[0], { autoAlpha: 1 });
      if (labels.length) {
        gsap.set(labels, { autoAlpha: 0 });
        gsap.set(labels[0], { autoAlpha: 1 });
      }
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: '.product-gallery',
          start: 'top top',
          end: () => `+=${Math.max(frames.length, 2) * window.innerHeight * 0.85}`,
          pin: true,
          scrub: true,
          anticipatePin: 1,
        },
      });
      frames.forEach((frame, index) => {
        if (index === 0) return;
        timeline
          .to(frames[index - 1], { autoAlpha: 0, duration: 0.45 }, index)
          .to(frame, { autoAlpha: 1, duration: 0.45 }, index);
        if (labels[index] && labels[index - 1]) {
          timeline
            .to(labels[index - 1], { autoAlpha: 0, duration: 0.3 }, index)
            .to(labels[index], { autoAlpha: 1, duration: 0.3 }, index);
        }
      });
    }

    gsap.utils.toArray('.feature-row').forEach((row) => {
      const copy = row.querySelector('.feature-copy');
      const shot = row.querySelector('.feature-shot');
      gsap.from(copy, {
        scrollTrigger: { trigger: copy, ...enter },
        y: 18,
        opacity: 0,
        duration: 0.55,
        ease: 'power3.out',
      });
      if (shot) {
        gsap.from(shot, {
          scrollTrigger: { trigger: shot, ...enter },
          y: 18,
          opacity: 0,
          duration: 0.55,
          ease: 'power3.out',
        });
      }
    });

    gsap.from('.step-card', {
      scrollTrigger: { trigger: '.steps-grid', ...enter },
      y: 24,
      opacity: 0,
      duration: 0.55,
      stagger: 0.12,
      ease: 'power2.out',
    });

    gsap.from('.flow-node', {
      scrollTrigger: { trigger: '.security-flow', ...enter },
      y: 16,
      opacity: 0,
      duration: 0.5,
      stagger: 0.14,
      ease: 'power2.out',
    });

    gsap.from('.download-section .eyebrow, .download-section h2, .download-section p, .download-section .button, .download-section small', {
      scrollTrigger: { trigger: '.download-section', start: 'top 92%' },
      y: 22,
      opacity: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: 'power3.out',
    });

    ScrollTrigger.refresh();

    return () => {
      node.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, { scope: root });

  return (
    <div className="marketing-site" ref={root}>
      <nav className="marketing-nav" aria-label="Main navigation">
        <Brand />
        <div className="nav-links">
          <a href="#why">Why</a>
          <a href="#product">Product</a>
          <a href="#features">Features</a>
          <a href="#download">Download</a>
        </div>
        <div className="nav-actions">
          <a className="nav-app" href="/app">Open app</a>
          <a className="button button-small button-primary" href={RELEASE_APK}>Download now <span>↓</span></a>
        </div>
      </nav>

      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> SOCIAL PAYMENTS</p>
          <h1>Move money at the speed of the <em>conversation.</em></h1>
          <p className="hero-lede">Stellar Pay brings chat, native XLM payments, and shared expenses into one place. Talk it out. Settle it there.</p>
          <div className="hero-actions">
            <a className="button button-primary" href={RELEASE_APK}>Download now <span>↓</span></a>
            <a className="text-link" href="#product">See the product <span>↓</span></a>
          </div>
          <div className="hero-note">
            <span className="note-stars">✦</span>
            <span>Powered by native XLM on Stellar</span>
            <span className="note-divider" />
            <span>Testnet MVP</span>
          </div>
        </div>
        <div className="hero-shot">
          <ProductShot src={chatShot} alt="Stellar Pay chat with an in-thread XLM payment" />
        </div>
      </section>

      <section className="why-section" id="why">
        <div className="section-intro">
          <p className="eyebrow"><span /> WHY STELLAR PAY</p>
          <h2>The moment money gets complicated is usually the moment the conversation leaves the room.</h2>
          <p>No separate payment links, no spreadsheet archaeology, no “who still owes me?” messages. Keep the plan and the settlement in one shared thread.</p>
        </div>
        <div className="why-row" aria-label="Product principles">
          {whyChips.map(([icon, title, body]) => (
            <div className="why-chip" key={title}>
              <span className="signal-icon">{icon}</span>
              <span><b>{title}</b><small>{body}</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="product-gallery" id="product">
        <div className="gallery-copy">
          <p className="eyebrow"><span /> THE PRODUCT</p>
          <h2>See it the way it actually looks.</h2>
          <div className="gallery-captions">
            {gallery.map((item) => (
              <p className="gallery-label" key={item.label}>
                <b>{item.label}</b>
                <span>{item.caption}</span>
              </p>
            ))}
          </div>
        </div>
        <div className="gallery-stage">
          {gallery.map((item) => (
            <div className="gallery-frame" key={item.label}>
              <ProductShot src={item.src} alt={item.caption} />
            </div>
          ))}
        </div>
      </section>

      <section className="download-strip" id="download">
        <div>
          <p className="eyebrow"><span /> ANDROID APK</p>
          <h2>Get the latest build.</h2>
          <p>Downloads the current GitHub Release package. No store listing — just the APK.</p>
        </div>
        <a className="button button-primary" href={RELEASE_APK}>Download Stellar Pay <span>↓</span></a>
      </section>
        <div className="feature-heading">
          <div>
            <p className="eyebrow"><span /> BUILT FOR REAL PLANS</p>
            <h2>Everything your group chat was missing.</h2>
          </div>
          <p>From a quick “I’ll get this” to a weekend away, every payment stays visible, intentional, and close to the people involved.</p>
        </div>
        {features.map((feature, index) => (
          <article className="feature-row" key={feature.number}>
            <div className="feature-copy">
              <div className="feature-top"><span>{feature.number}</span><b>{feature.icon}</b></div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
            <div className="feature-shot">
              <ProductShot src={feature.shot} alt={feature.shotAlt} />
            </div>
          </article>
        ))}
      </section>

      <section className="story-section" id="how-it-works">
        <div className="section-intro">
          <p className="eyebrow"><span /> HOW IT WORKS</p>
          <h2>Connect. Talk. Move money.</h2>
          <p>Three steps, one wallet approval. Stellar Pay prepares the transaction; you sign it.</p>
        </div>
        <div className="steps-grid">
          {steps.map(([number, title, body]) => (
            <article className="step-card" key={number}>
              <span className="step-number">{number}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
              <span className="step-arrow">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="security-section" id="security">
        <div className="security-heading">
          <p className="eyebrow"><span /> DESIGNED WITH CUSTODY IN MIND</p>
          <h2>Your wallet stays yours.<br /><em>That part is non-negotiable.</em></h2>
          <p>Stellar Pay does not hold your private keys or move funds on your behalf. The app prepares the transaction; your wallet gives the final approval.</p>
        </div>
        <div className="security-layout">
          <div className="security-flow" aria-label="Payment security flow">
            <div className="flow-node"><span className="flow-number">01</span><b>Stellar Pay</b><small>Builds an unsigned transaction</small></div>
            <div className="flow-line"><i /> <span>unsigned XDR</span> <i /></div>
            <div className="flow-node highlighted"><span className="flow-number">02</span><b>Your wallet</b><small>You review and sign locally</small></div>
            <div className="flow-line"><i /> <span>signed transaction</span> <i /></div>
            <div className="flow-node"><span className="flow-number">03</span><b>Stellar network</b><small>Horizon submits and confirms it</small></div>
          </div>
          <div className="security-notes">
            <div><span>✓</span><p><b>Private keys never reach the server.</b> Signing happens in Freighter or the connected wallet.</p></div>
            <div><span>✓</span><p><b>Payments are traceable.</b> Each completed transfer is a real Stellar network transaction.</p></div>
            <div className="security-caveat"><span>!</span><p><b>Current status: testnet MVP.</b> Authentication, rate limiting, and durable chat storage are still required before mainnet use.</p></div>
          </div>
        </div>
      </section>

      <section className="download-section">
        <p className="eyebrow"><span /> READY WHEN YOU ARE</p>
        <h2>Put the payment<br /><em>back in the plan.</em></h2>
        <p>Get the latest Stellar Pay Android build from GitHub Releases. Same app. Same dark chrome. Signed by your wallet.</p>
        <a className="button button-primary" href={RELEASE_APK}>Download latest release <span>↓</span></a>
        <small>Android APK · Web at /app · Stellar testnet</small>
      </section>

      <footer className="marketing-footer">
        <Brand />
        <p>Conversation-first payments on Stellar.</p>
        <div>
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="/app">Open app</a>
          <a href={RELEASE_APK}>Download</a>
        </div>
        <small>© 2026 Stellar Pay · Testnet MVP</small>
      </footer>
    </div>
  );
}
