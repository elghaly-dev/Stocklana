const tabs = document.querySelectorAll('.tab');
function show(name) {
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
    document.getElementById(`tab-${t.dataset.tab}`).hidden = !on;
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}
const ASK = {
  xstocks: 'Is TSLAx (xStocks) on Solana trading at a premium or discount to TSLA right now, and why might the peg drift? Also compare AAPLx and NVDAx.',
  prestocks: 'How do PreStocks pre-IPO tokens on Solana stay close to the value of the private company shares, and why might their price drift from it?',
};
for (const askBtn of document.querySelectorAll('#ask-chatgpt, #ask-chatgpt-ps')) askBtn.addEventListener('click', () => {
  const active = document.querySelector('.tab.active')?.dataset.tab || 'xstocks';
  window.open(`https://chatgpt.com/?q=${encodeURIComponent(ASK[active] || ASK.xstocks)}`, '_blank', 'noopener');
});
for (const t of tabs) t.addEventListener('click', () => show(t.dataset.tab));
if (location.hash === '#prestocks') show('prestocks');
