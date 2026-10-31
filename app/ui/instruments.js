// The instruments of Hardware, shared with Home and the assistant: a needle thermometer, a battery in relief and Wi-Fi arcs in relief.
function thermometer() {
  let ticks = '';
  for (let t = 20; t <= 100; t += 10) {
    const a = Math.PI + (t - 20) / 80 * Math.PI, r1 = 46, r2 = t % 20 === 0 ? 39 : 42;
    ticks += `<path d="M${(60 + r1 * Math.cos(a)).toFixed(1)} ${(62 + r1 * Math.sin(a)).toFixed(1)}L${(60 + r2 * Math.cos(a)).toFixed(1)} ${(62 + r2 * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<svg class="thermo" viewBox="0 0 120 72" aria-hidden="true"><g class="thermo__ticks">${ticks}</g><path class="thermo__red" d="M98.2 36.4A46 46 0 0 1 106.0 62.0"/><g class="thermo__needle"><path d="M58.8 62 60 22l1.2 40z"/></g><circle class="thermo__pivot" cx="60" cy="62" r="5"/></svg>`;
}
const setThermometer = (svg, t) => { if (t != null) svg.querySelector('.thermo__needle').style.transform = `rotate(${(-90 + Math.max(0, Math.min(1, (t - 20) / 80)) * 180).toFixed(1)}deg)`; };
const batteryRelief = () => '<div class="cell-relief"><span class="cell-relief__segments">' + '<i></i>'.repeat(10) + '</span><span class="cell-relief__tip"></span></div>';
function setBattery(el, b) {
  const lit = Math.ceil(b.charge / 10), low = b.charge <= 15 && !b.mains;
  el.querySelectorAll('.cell-relief__segments i').forEach((s, i) => s.className = i < lit ? (low ? 'low' : 'full') : '');
}
const WIFI_ARCS = ['M38 46a31 31 0 0 1 44 0', 'M28 36a45 45 0 0 1 64 0', 'M18 26a59 59 0 0 1 84 0'];
const wifiRelief = () => `<svg class="wifi-relief" viewBox="0 0 120 72" aria-hidden="true"><g class="wifi-relief__bevel">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="59" r="6"/></g>`
  + `<g class="wifi-relief__grooves">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="58" r="6"/></g>`
  + `<g class="wifi-relief__lit">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="58" r="3.6"/></g></svg>`;
function setWifi(svg, signal, connected) {
  const lit = [...svg.querySelectorAll('.wifi-relief__lit > *')];
  const arcs = connected ? Math.min(3, Math.floor(signal / 25)) : 0;
  lit.forEach((el, i) => el.classList.toggle('on', el.tagName === 'circle' ? connected : i < arcs));
}
