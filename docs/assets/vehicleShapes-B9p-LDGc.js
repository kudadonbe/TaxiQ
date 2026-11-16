var e={hatchback:{w:20,h:34},sedan:{w:20,h:38},suv:{w:22,h:38},van:{w:22,h:40},minibus:{w:24,h:48},pickup:{w:22,h:42},lorry:{w:24,h:48},bus:{w:20,h:80},scooter:{w:14,h:30},motorbike:{w:16,h:34},ebike:{w:16,h:32},bicycle:{w:12,h:30}},t=`#475569`,n=/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i,r=e=>e===`currentColor`||n.test(e)?e:t,i=[[/red|ރަތް/i,`#dc2626`],[/blue|ނޫ/i,`#2563eb`],[/green|ފެހި/i,`#16a34a`],[/white|ހުދު/i,`#f8fafc`],[/black|ކަޅު/i,`#1e293b`],[/silver|grey|gray|ރިހި/i,`#94a3b8`],[/yellow|ރީނދޫ/i,`#facc15`],[/orange|ތެޔޮކުލަ/i,`#f97316`],[/brown|ދޮން/i,`#92400e`],[/purple|ވައިލެޓް/i,`#7c3aed`],[/pink|ފިޔާތޮށި/i,`#ec4899`]],a=e=>i.find(([t])=>t.test(e))?.[1]??`#475569`,o=`#0f172a`,s=`#fde68a`;function c(e,t,n){return e===`man`?`<ellipse cx="${t}" cy="${n+2.2}" rx="5.4" ry="2.6" fill="#334155"/><circle cx="${t}" cy="${n}" r="3.1" fill="${o}"/>`:e===`woman`?`<ellipse cx="${t}" cy="${n+2.2}" rx="4.3" ry="2.3" fill="#475569"/><path d="M${t-2.4} ${n+1} C${t-2} ${n+7} ${t-1} ${n+10} ${t} ${n+10.5} C${t+1} ${n+10} ${t+2} ${n+7} ${t+2.4} ${n+1} Z" fill="#be185d" opacity=".92"/><circle cx="${t}" cy="${n}" r="3" fill="${o}"/><path d="M${t-2.8} ${n} A2.9 2.9 0 0 1 ${t+2.8} ${n}" fill="none" stroke="#be185d" stroke-width="1.4"/>`:e===`young`?`<ellipse cx="${t}" cy="${n+1.8}" rx="3.5" ry="1.9" fill="#334155"/><circle cx="${t}" cy="${n}" r="2.5" fill="${o}"/>`:`<circle cx="${t}" cy="${n}" r="3.6" fill="${o}" opacity=".85"/>`}var l=(e,t,n=2.5,r=3,i=2)=>`<rect x="${e}" y="${n}" width="${r}" height="${i}" rx="1" fill="${s}"/><rect x="${t}" y="${n}" width="${r}" height="${i}" rx="1" fill="${s}"/>`,u={hatchback:e=>`<rect x="1.5" y="1.5" width="17" height="31" rx="6" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <path d="M4.5 9 Q10 6 15.5 9 L14.5 13.5 H5.5 Z" fill="${o}" opacity=".85"/>
  <rect x="5.5" y="14.5" width="9" height="10.5" rx="1.5" fill="${o}" opacity=".15"/>
  <path d="M5.5 26 H14.5 L15 29.5 Q10 31 5 29.5 Z" fill="${o}" opacity=".7"/>
  ${l(3,14)}`,sedan:e=>`<rect x="1.5" y="1.5" width="17" height="35" rx="5.5" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <path d="M4.5 10 Q10 7 15.5 10 L14.5 14.5 H5.5 Z" fill="${o}" opacity=".85"/>
  <rect x="5.5" y="15.5" width="9" height="8.5" rx="1.5" fill="${o}" opacity=".15"/>
  <path d="M5.5 25 H14.5 L15.3 29 Q10 30.3 4.7 29 Z" fill="${o}" opacity=".7"/>
  <line x1="4" y1="31.5" x2="16" y2="31.5" stroke="${o}" stroke-width="1" opacity=".4"/>
  ${l(3,14)}`,suv:e=>`<rect x="1.5" y="1.5" width="19" height="35" rx="4" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <path d="M4.5 8 Q11 5.5 17.5 8 L16.5 12.5 H5.5 Z" fill="${o}" opacity=".85"/>
  <rect x="5.5" y="13.5" width="11" height="18" rx="1.5" fill="${o}" opacity=".15"/>
  <line x1="5" y1="14" x2="5" y2="31" stroke="${o}" stroke-width="1.2" opacity=".55"/>
  <line x1="17" y1="14" x2="17" y2="31" stroke="${o}" stroke-width="1.2" opacity=".55"/>
  <rect x="5.5" y="32.5" width="11" height="2.5" rx="1" fill="${o}" opacity=".7"/>
  ${l(3.5,15.5)}`,van:e=>`<rect x="1.5" y="1.5" width="19" height="37" rx="4" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <path d="M4.5 8 Q11 5.5 17.5 8 L16.5 12.5 H5.5 Z" fill="${o}" opacity=".85"/>
  <rect x="5" y="15" width="12" height="20" rx="1.5" fill="${o}" opacity=".18"/>
  ${l(3.5,15.5)}`,minibus:e=>`<rect x="1.5" y="1.5" width="21" height="45" rx="3.5" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <rect x="4" y="3.5" width="16" height="5" rx="1.5" fill="${o}" opacity=".85"/>
  <rect x="3" y="12" width="1.8" height="31" rx=".8" fill="${o}" opacity=".6"/>
  <rect x="19.2" y="12" width="1.8" height="31" rx=".8" fill="${o}" opacity=".6"/>
  <rect x="6.5" y="12" width="11" height="31" rx="1.5" fill="#ffffff" opacity=".2"/>
  <rect x="9" y="22" width="6" height="4" rx=".8" fill="${o}" opacity=".35"/>
  ${l(3,18,2.5,3,1.6)}`,pickup:e=>`<rect x="1.5" y="1.5" width="19" height="39" rx="5" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <path d="M4.5 8.5 Q11 6 17.5 8.5 L16.5 13 H5.5 Z" fill="${o}" opacity=".85"/>
  <rect x="5" y="13.5" width="12" height="5" rx="1" fill="${o}" opacity=".15"/>
  <line x1="4" y1="20" x2="18" y2="20" stroke="${o}" stroke-width="1.5"/>
  <rect x="4" y="21" width="14" height="17" rx="1.5" fill="none" stroke="${o}" stroke-width="1.5" opacity=".7"/>
  ${l(3.5,15.5)}`,lorry:e=>`<rect x="2" y="1.5" width="20" height="11" rx="3" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <rect x="4" y="3.5" width="16" height="3.5" rx="1" fill="${o}" opacity=".85"/>
  <rect x="1.5" y="14" width="21" height="32.5" rx="1" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <rect x="3.5" y="16" width="17" height="28.5" rx=".5" fill="#ffffff" opacity=".35"/>
  <line x1="12" y1="16" x2="12" y2="44.5" stroke="${o}" stroke-width=".8" opacity=".3"/>
  ${l(3,18,2.3,3,1.6)}`,bus:e=>`<rect x="1.5" y="1.5" width="17" height="77" rx="3" fill="${e}" stroke="${o}" stroke-width="1.5"/>
  <rect x="3.5" y="3.5" width="13" height="5" rx="1.2" fill="${o}" opacity=".85"/>
  <rect x="4.5" y="12" width="11" height="62" rx="1.5" fill="#ffffff" opacity=".22"/>
  <rect x="7" y="22" width="6" height="4" rx=".8" fill="${o}" opacity=".35"/>
  <rect x="7" y="50" width="6" height="4" rx=".8" fill="${o}" opacity=".35"/>
  ${l(2.5,14.5,2.5,3,1.6)}`,scooter:(e,t)=>`<rect x="5.5" y="1" width="3" height="5.5" rx="1.5" fill="${o}"/>
  <rect x="5.5" y="23.5" width="3" height="5.5" rx="1.5" fill="${o}"/>
  <line x1="1.5" y1="7.5" x2="12.5" y2="7.5" stroke="${o}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="3.5" y="6" width="7" height="5.5" rx="2.5" fill="${e}" stroke="${o}" stroke-width="1.1"/>
  <rect x="4.5" y="10.5" width="5" height="6" fill="${e}" stroke="${o}" stroke-width="1.1"/>
  <rect x="3.5" y="15" width="7" height="11" rx="3.5" fill="${e}" stroke="${o}" stroke-width="1.1"/>
  ${c(t,7,16.5)}
  <circle cx="7" cy="6.6" r="1" fill="${s}"/>`,motorbike:(e,t)=>`<rect x="6.5" y="1" width="3" height="7" rx="1.5" fill="${o}"/>
  <rect x="6.5" y="26" width="3" height="7" rx="1.5" fill="${o}"/>
  <line x1="2" y1="9" x2="14" y2="9" stroke="${o}" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="5" y="8" width="6" height="19" rx="3" fill="${e}" stroke="${o}" stroke-width="1.2"/>
  ${c(t,8,15.5)}
  <circle cx="8" cy="2" r="1" fill="${s}"/>`,ebike:(e,t)=>`<rect x="6.5" y="1" width="3" height="6" rx="1.5" fill="${o}"/>
  <rect x="6.5" y="25" width="3" height="6" rx="1.5" fill="${o}"/>
  <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="${o}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="5.5" y="7" width="5" height="19" rx="2.5" fill="${e}" stroke="${o}" stroke-width="1.1"/>
  <rect x="6.5" y="19" width="3" height="5" rx=".8" fill="#22c55e"/>
  ${c(t,8,13.5)}`,bicycle:(e,t)=>`<rect x="5.25" y="1" width="1.5" height="8" rx=".75" fill="${o}"/>
  <rect x="5.25" y="21" width="1.5" height="8" rx=".75" fill="${o}"/>
  <line x1="6" y1="6" x2="6" y2="24" stroke="${o}" stroke-width="2.8" stroke-linecap="round"/>
  <line x1="6" y1="6" x2="6" y2="24" stroke="${e}" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="1.5" y1="7" x2="10.5" y2="7" stroke="${o}" stroke-width="1.2" stroke-linecap="round"/>
  <ellipse cx="6" cy="19.5" rx="1.4" ry="2" fill="${o}"/>
  ${c(t,6,15.5)}`};function d(t,n,i=`none`){let a=e[t]?t:`hatchback`,{w:o,h:s}=e[a];return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o} ${s}" width="${o}" height="${s}" aria-hidden="true">
  ${u[a](r(n),i)}
</svg>`}var f=e=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(e)}`;export{f as i,a as n,d as r,e as t};