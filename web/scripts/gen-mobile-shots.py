# Generates portrait Flutter-UI mock SVGs (no raw '&').
from pathlib import Path

ROOT = Path("/Users/shantanavmukherjee/Desktop/code/self-projects/Stellar-Pay/web/src/assets/screenshots")

PHONE = '''  <rect x="18" y="18" width="384" height="844" rx="44" fill="#1a1a1a"/>
  <rect x="26" y="26" width="368" height="828" rx="36" fill="#090909"/>
  <rect x="168" y="36" width="84" height="22" rx="11" fill="#000000"/>
  <text x="48" y="78" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="12" font-weight="600">9:41</text>
  <text x="318" y="78" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="11">LTE</text>'''


def header(title, subtitle, pin=False):
    pin_svg = (
        '<path d="M332 118 h14 v4 h-4 v12 l-3 4 -3-4 v-12 h-4z" fill="#f7f7f5"/>'
        if pin
        else ""
    )
    return f'''  <path d="M46 108 h18 M46 114 h18 M46 120 h18" stroke="#f7f7f5" stroke-width="2"/>
  <text x="78" y="116" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="18" font-weight="800">{title}</text>
  <text x="78" y="132" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="9" font-weight="700" letter-spacing="0.8">{subtitle}</text>
  {pin_svg}
  <text x="348" y="122" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="9" font-weight="800">ONLINE</text>
  <circle cx="338" cy="119" r="3" fill="#ffffff"/>
  <line x1="26" y1="148" x2="394" y2="148" stroke="#3d3d3d"/>'''


def composer(hint, pay_label="Pay XLM"):
    return f'''  <rect x="26" y="708" width="368" height="146" fill="#101010"/>
  <rect x="42" y="722" width="162" height="36" fill="none" stroke="#3d3d3d"/>
  <text x="54" y="745" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="12" font-weight="700">{pay_label}</text>
  <rect x="216" y="722" width="162" height="36" fill="none" stroke="#3d3d3d"/>
  <text x="228" y="745" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="12" font-weight="700">Request XLM</text>
  <rect x="42" y="770" width="268" height="50" fill="#111111" stroke="#3d3d3d"/>
  <text x="56" y="800" fill="#777777" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">{hint}</text>
  <rect x="320" y="770" width="50" height="50" fill="#f7f7f5"/>
  <path d="M345 800 l0 -16 l-6 6 m6 -6 l6 6" stroke="#090909" stroke-width="2" fill="none"/>'''


def wrap(inner):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 880" fill="none">
  <rect width="420" height="880" fill="#080808"/>
{PHONE}
{inner}
</svg>
'''


chat = wrap(
    header("@maya", "Direct message - members only")
    + '''
  <rect x="42" y="168" width="250" height="70" fill="#181818" stroke="#3d3d3d"/>
  <text x="56" y="188" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">@maya</text>
  <text x="56" y="214" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="14">Can you send your share?</text>
  <rect x="128" y="252" width="250" height="70" fill="#292929" stroke="#555555"/>
  <text x="142" y="272" fill="#c6c6c6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">YOU</text>
  <text x="142" y="298" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="14">Sending 12 XLM now.</text>
  <rect x="42" y="338" width="336" height="92" fill="#202020" stroke="#666666"/>
  <text x="56" y="360" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">SYSTEM</text>
  <text x="56" y="388" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="15">Payment sent: 12 XLM to @maya</text>
  <text x="56" y="412" fill="#a8f06a" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">Confirmed</text>
'''
    + composer("Message @maya")
)

request = wrap(
    header("@sam", "Direct message - members only")
    + '''
  <rect x="42" y="168" width="250" height="64" fill="#181818" stroke="#3d3d3d"/>
  <text x="56" y="188" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">@sam</text>
  <text x="56" y="212" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="14">Cover the cab? Requesting here.</text>
  <rect x="42" y="248" width="336" height="210" fill="#202020" stroke="#666666"/>
  <text x="56" y="276" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.4">PAYMENT REQUEST</text>
  <text x="56" y="324" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="32" font-weight="900">8.50 XLM</text>
  <text x="56" y="352" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="14">Requested from you</text>
  <rect x="56" y="372" width="308" height="50" fill="none" stroke="#f7f7f5"/>
  <text x="168" y="403" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="14" font-weight="800">Pay now</text>
'''
    + composer("Message @sam")
)

split = wrap(
    header("Weekend trip", "Group chat - members only", pin=True)
    + '''
  <rect x="42" y="168" width="336" height="292" fill="#202020" stroke="#666666"/>
  <text x="56" y="192" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.2">PINNED OUTING - 48 XLM</text>
  <text x="56" y="224" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="22" font-weight="800">Cab to the coast</text>
  <text x="56" y="248" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">Split across 4 members.</text>
  <line x1="56" y1="264" x2="362" y2="264" stroke="#3d3d3d"/>
  <text x="56" y="290" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">@sam - 12 XLM</text>
  <text x="310" y="290" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="12" font-weight="800">Covered</text>
  <line x1="56" y1="306" x2="362" y2="306" stroke="#3d3d3d"/>
  <text x="56" y="332" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">@maya - 12 XLM</text>
  <text x="328" y="332" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="12" font-weight="800">Paid</text>
  <line x1="56" y1="348" x2="362" y2="348" stroke="#3d3d3d"/>
  <text x="56" y="374" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">@alex - 12 XLM</text>
  <rect x="268" y="358" width="94" height="28" fill="none" stroke="#f7f7f5"/>
  <text x="280" y="377" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="11" font-weight="800">Pay share</text>
  <line x1="56" y1="400" x2="362" y2="400" stroke="#3d3d3d"/>
  <text x="56" y="426" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">@jules - 12 XLM</text>
  <text x="318" y="426" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="12">Unpaid</text>
'''
    + composer("Message Weekend trip", pay_label="Outing")
)

sidebar = wrap(
    header("Your messages", "Social payments")
    + '''
  <rect x="26" y="26" width="368" height="828" rx="36" fill="#090909" opacity="0.45"/>
  <rect x="26" y="26" width="300" height="828" rx="36" fill="#171717"/>
  <rect x="26" y="26" width="36" height="828" fill="#171717"/>
  <text x="48" y="86" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="26" font-weight="900" letter-spacing="-2">STELLAR</text>
  <text x="48" y="112" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="26" font-weight="900" letter-spacing="-2">PAY</text>
  <rect x="48" y="140" width="252" height="48" fill="#f7f7f5"/>
  <text x="64" y="170" fill="#090909" font-family="Inter, ui-sans-serif, sans-serif" font-size="14" font-weight="800">@sam</text>
  <text x="48" y="208" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10">GABCD...WXYZ</text>
  <text x="48" y="240" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.4">EVM WALLET</text>
  <rect x="48" y="256" width="252" height="40" fill="none" stroke="#3d3d3d"/>
  <text x="64" y="281" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">Connect wallet</text>
  <rect x="48" y="312" width="252" height="40" fill="none" stroke="#3d3d3d"/>
  <text x="64" y="337" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">New direct message</text>
  <rect x="48" y="360" width="252" height="40" fill="none" stroke="#3d3d3d"/>
  <text x="64" y="385" fill="#f7f7f5" font-family="Inter, ui-sans-serif, sans-serif" font-size="13">New group</text>
  <text x="48" y="440" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="10" font-weight="800" letter-spacing="1.4">CHATS</text>
  <text x="48" y="476" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="16">@maya</text>
  <text x="48" y="512" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="16">Weekend trip</text>
  <text x="48" y="548" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="16">@alex</text>
'''
)

wallet = wrap(
    header("Your messages", "Social payments")
    + '''
  <circle cx="210" cy="320" r="26" fill="#f7f7f5"/>
  <text x="201" y="328" fill="#090909" font-family="Inter, ui-sans-serif, sans-serif" font-size="22">*</text>
  <text x="210" y="380" fill="#ffffff" font-family="Inter, ui-sans-serif, sans-serif" font-size="20" font-weight="800" text-anchor="middle">Start a direct message</text>
  <text x="210" y="408" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="13" text-anchor="middle">Search an existing username.</text>
  <text x="210" y="426" fill="#a6a6a6" font-family="Inter, ui-sans-serif, sans-serif" font-size="13" text-anchor="middle">Payments stay in the chat.</text>
  <rect x="86" y="456" width="248" height="50" fill="#f7f7f5"/>
  <text x="210" y="487" fill="#090909" font-family="Inter, ui-sans-serif, sans-serif" font-size="14" font-weight="800" text-anchor="middle">New direct message</text>
'''
)

ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "chat.svg").write_text(chat)
(ROOT / "request.svg").write_text(request)
(ROOT / "split.svg").write_text(split)
(ROOT / "sidebar.svg").write_text(sidebar)
(ROOT / "wallet.svg").write_text(wallet)
print("wrote", list(ROOT.glob("*.svg")))
