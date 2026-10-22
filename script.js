(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const state = { report:null };
  const fmt = n => new Intl.NumberFormat("it-IT", {minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function detectDelimiter(text) {
    const lines = String(text).split(/\r\n|\n|\r/).filter(line => line.trim()).slice(0, 40);
    const candidates = [",", ";", "\t"];
    let best = ",", bestScore = -Infinity;
    for (const delimiter of candidates) {
      const counts = [];
      for (const line of lines) {
        let quoted = false, count = 0;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"' && quoted && line[i + 1] === '"') i++;
          else if (c === '"') quoted = !quoted;
          else if (c === delimiter && !quoted) count++;
        }
        if (count > 0) counts.push(count);
      }
      if (!counts.length) continue;
      const frequency = new Map();
      for (const count of counts) frequency.set(count, (frequency.get(count) || 0) + 1);
      const modeEntry = [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      const consistency = modeEntry[1] / counts.length;
      const score = consistency * 100 + Math.log2(modeEntry[0] + 1) * 5 + Math.log2(counts.length + 1);
      if (score > bestScore) { bestScore = score; best = delimiter; }
    }
    return best;
  }
  function csvRows(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) { row.push(cell); cell = ""; }
      else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && next === "\n") i++;
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
        row = []; cell = "";
      } else cell += c;
    }
    if (quoted) throw new Error("CSV non valido: virgolette non bilanciate.");
    if (cell.length || row.length) {
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
    }
    return rows.map(current => current.map(cleanText));
  }
  function cleanText(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim();
  }
  function number(value) {
    if (value == null) return null;
    let s = String(value).trim().replace(/−/g, "-").replace(/[€$£\s\u00A0\u202F]/g, "");
    if (!s || s === "-" || s === "–") return null;
    let negative = /^\(.*\)$/.test(s);
    if (negative) s = s.slice(1, -1);
    if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
    s = s.replace(/[^0-9,.-]/g, "").replace(/-/g, "");
    if (!s || !/[0-9]/.test(s)) return null;
    const commaCount = (s.match(/,/g) || []).length;
    const dotCount = (s.match(/\./g) || []).length;
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (commaCount && dotCount) {
      const decimalSeparator = lastComma > lastDot ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";
      s = s.split(groupingSeparator).join("");
      const at = s.lastIndexOf(decimalSeparator);
      s = s.slice(0, at).split(decimalSeparator).join("") + "." + s.slice(at + 1);
    } else if (commaCount || dotCount) {
      const separator = commaCount ? "," : ".";
      const parts = s.split(separator);
      const tail = parts[parts.length - 1];
      const groupedThousands = parts.length > 2 && parts.slice(1).every(part => /^\d{3}$/.test(part));
      const singleThousandsGroup = parts.length === 2 && /^\d{1,3}$/.test(parts[0]) &&
        /^\d{3}$/.test(tail) && !/^0+$/.test(parts[0]);
      if (groupedThousands || singleThousandsGroup) s = parts.join("");
      else {
        const at = s.lastIndexOf(separator);
        s = s.slice(0, at).split(separator).join("") + "." + s.slice(at + 1);
      }
    }
    const result = Number(s);
    return Number.isFinite(result) ? (negative ? -Math.abs(result) : result) : null;
  }
  function normalizedLabel(value) {
    return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/\s+/g, " ");
  }
  function rowPair(rows, labels) {
    const expected = (Array.isArray(labels) ? labels : [labels]).map(normalizedLabel);
    const matches = [];
    for (const row of rows) {
      const index = row.findIndex(cell => expected.includes(normalizedLabel(cell)));
      if (index < 0 || index + 1 >= row.length) continue;
      const raw = row[index + 1];
      const value = number(raw);
      if (value !== null) matches.push({ value, raw, row });
    }
    const uniqueValues = [...new Set(matches.map(match => match.value))];
    if (uniqueValues.length > 1) return { value: null, ambiguous: true, values: uniqueValues, row: matches[0].row };
    return matches.length ? { ...matches[0], ambiguous: false } : null;
  }
  function uniquePatternNumber(rows, pattern) {
    const found = [];
    for (const row of rows) {
      const index = row.findIndex(cell => pattern.test(String(cell || "")));
      if (index >= 0 && index + 1 < row.length) {
        const value = number(row[index + 1]);
        if (value !== null) found.push(value);
      }
    }
    const unique = [...new Set(found)];
    return unique.length === 1 ? unique[0] : null;
  }
  function valueLabel(rows, label, within) {
    const values = [];
    const expected = normalizedLabel(label);
    for (const row of rows) {
      if (within && !within(row)) continue;
      const index = row.findIndex(cell => normalizedLabel(cell) === expected);
      if (index < 0 || index + 1 >= row.length) continue;
      const value = number(row[index + 1]);
      if (value !== null) values.push(value);
    }
    const unique = [...new Set(values)];
    return unique.length === 1 ? unique[0] : null;
  }
  function findSection(rows, regex, from=0){for(let i=from;i<rows.length;i++){if(regex.test(rows[i][0]||''))return i;}return -1;}
  function segment(rows,start,end,starts){const out=[];let current=null;for(let i=start;i<end;i++){const r=rows[i],first=r[0]||'';if(starts.some(re=>re.test(first))){if(current)out.push(current);current={title:first,rows:[r],start:i};}else if(current)current.rows.push(r);}if(current)out.push(current);return out;}
  function accountRecord(title,rows,kind){
    const get = (...labels) => rowPair(rows, labels)?.value ?? null;
    const mean = get("Saldo medio per l'intero periodo", "Saldo medio dell'intero anno", "Saldo medio", "Giacenza media");
    const max = get("Saldo massimo", "Valore massimo");
    const closing = get("Saldo di chiusura", "Saldo finale", "Valore finale");
    const days = uniquePatternNumber(rows, /Giorni di possesso/i);
    const institution = rows.find(r=>/Nome dell'istituto finanziario/i.test(r[0]||''));
    const institutionName=institution?institution[1]:null;
    const countryRow=rows.find(r=>/^Indirizzo e paese$/i.test(r[0]||''));
    const income={grossInterest:get('Introiti da interessi'),taxInterest:get("Ritenuta d'acconto sugli interessi"),grossIncome:get('Gross income'),netIncome:get('Net income'),withheld:get('Imposte trattenute'),invites:get('Introiti da inviti'),rewards:get('Rendimento delle ricompense'),cashback:get('Introiti da cashback'),dividends:get('Dividends')??get('Dividendi'),dividendTax:get('Tax withheld on dividend')??get("Ritenuta d'acconto sul dividendo")};
    const sales={gross:get('Ricavo lordo'),cost:get('Cost basis'),fees:get('Commissioni e altri addebiti'),pnl:get('PnL al netto delle imposte')};
    return {title,kind,mean,max,closing,days,institution:institutionName,address:countryRow?.[1]||null,income,sales,rows};
  }
  function analyze(text, filename){
    const rows=csvRows(text); if(rows.length<10)throw new Error('Il CSV è troppo corto o non è leggibile.');
    const sections=[];
    const invStart=findSection(rows,/Investment Services Riepiloghi/i), cryptoStart=findSection(rows,/Crypto Riepiloghi/i), commodityStart=findSection(rows,/Materia prima Riepiloghi/i);
    const sectionEnd=(start,starts)=>starts.filter(i=>i>=0&&i>start).sort((a,b)=>a-b)[0]??rows.length;
    const invEnd=sectionEnd(invStart,[cryptoStart,commodityStart]);
    const cryptoEnd=sectionEnd(cryptoStart,[invStart,commodityStart]);
    const commodityEnd=sectionEnd(commodityStart,[invStart,cryptoStart]);
    if(invStart>=0){
      const part = rows.slice(invStart, invEnd);
      const segs = segment(part, 1, part.length, [/^Dettagli del conto di intermediazione/i, /^Robo-Advisor/i]);
      const seenBlocks = new Set();
      for (const segmentBlock of segs) {
        const record = accountRecord(segmentBlock.title, segmentBlock.rows, "investimenti");
        const values = [
          record.mean, record.max, record.closing, record.days,
          ...Object.values(record.income), ...Object.values(record.sales)
        ];
        // Le intestazioni generali possono ripetere il nome del prodotto senza contenere importi.
        if (!values.some(value => typeof value === "number" && Number.isFinite(value))) continue;
        // Scarta soltanto blocchi identici riga per riga; non unisce conti diversi con valori simili.
        const signature = JSON.stringify(segmentBlock.rows);
        if (seenBlocks.has(signature)) continue;
        seenBlocks.add(signature);
        sections.push(record);
      }
    }
    let crypto=null;
    if(cryptoStart>=0){const cr=rows.slice(cryptoStart,cryptoEnd);const pick=(label)=>rowPair(cr,label)?.value??null;
      const holdStart=cr.findIndex(r=>/Riepilogo delle posizioni di fine anno/i.test(r[0]||''));let holdings=[];if(holdStart>=0){for(let i=holdStart+2;i<cr.length;i++){const r=cr[i];if(/^(Totale|Valore del deposito|[-]+)$/i.test(r[0]||''))break;if(r.length>=3&&r[0]&&!/Descrizione e simbolo/i.test(r[0])){const val=r.length>3?number(r[3]):null;if(val!==null)holdings.push({asset:r[0],units:r[1],unitPrice:r[2],value:val});}}}
      const endYearTotal = holdStart >= 0 ? cr.slice(holdStart + 1).find(r => /^Totale$/i.test(r[0] || "")) || null : null;
      const endYearReported=endYearTotal?endYearTotal.slice(1).map(number).find(v=>v!==null)??null:null;
      crypto={endYearReported,gross:pick('Valore lordo delle vendite'),cost:pick("Costo dell'acquisto"),fees:pick('Commissioni e altri addebiti'),pnl:pick('Plusvalenze al netto delle imposte'),learn:pick('Entrate da attività su Learn & Earn'),staking:pick('Reddito da staking'),mean:pick("Saldo medio per l'intero periodo"),max:pick('Saldo massimo'),closing:pick('Saldo di chiusura'),days:uniquePatternNumber(cr, /Giorni di possesso/i),institution:(cr.find(r=>/Nome dell'istituto finanziario/i.test(r[0]||''))||[])[1]||null,address:(cr.find(r=>/^Indirizzo e paese$/i.test(r[0]||''))||[])[1]||null,holdings,rows:cr};
    }
    let commodity=null;
    if(commodityStart>=0){const cr=rows.slice(commodityStart,commodityEnd);commodity={gross:valueLabel(cr,'Ricavo lordo'),basis:valueLabel(cr,'Base imponibile'),pnl:valueLabel(cr,'Profitti e perdite lordi realizzati'),rows:cr};}
    const investmentSections = sections.filter(s => s.kind === "investimenti");
    const sumAvailable = values => {
      const present = values.filter(value => typeof value === "number" && Number.isFinite(value));
      if (!present.length) return null;
      const cents = present.reduce((sum, value) => sum + Math.round((value + Number.EPSILON) * 100), 0);
      return cents / 100;
    };
    const divs = sumAvailable(investmentSections.map(s => s.income.dividends));
    const sales = sumAvailable(investmentSections.map(s => s.sales.pnl));
    const warnings=[];
    if(!crypto)warnings.push('La sezione cripto non è stata riconosciuta: verificare che il file sia un estratto consolidato Revolut completo.');
    if(sections.some(s=>s.kind==='investimenti'))warnings.push('Per gli investimenti esteri, il quadro W dipende dalla natura giuridica del rapporto, dal luogo di detenzione e dalla titolarità: il nome del broker da solo non basta a completare tutti i campi.');
    if(crypto)warnings.push('Per le cripto-attività, verificare il valore fiscale di fine anno, la titolarità, i giorni di detenzione e il criterio di valorizzazione applicabile. Il valore del riepilogo non è automaticamente il valore da dichiarare.');
    if((crypto?.learn||0)>0 || (crypto?.staking||0)>0)warnings.push('Learn & Earn e staking sono separati dalle vendite: il trattamento fiscale va determinato prima di trasferire gli importi nella dichiarazione.');
    warnings.push('Il CSV non contiene necessariamente tutti i dati fiscali storici: costi precedenti, trasferimenti in entrata, operazioni su altri broker o wallet e minusvalenze pregresse vanno verificati separatamente.');
    warnings.push('Gli importi sono estratti dal CSV e formattati senza attribuire automaticamente una valuta fiscale. Verifica la valuta originaria e le istruzioni ufficiali dell’anno d’imposta prima di usarli nella dichiarazione.');
    return {filename,rows:rows.length,sections,crypto,commodity,totals:{dividends:divs,investmentPnl:sales},warnings,period:detectPeriod(rows,filename)};
  }
  function detectPeriod(rows, filename) {
    const name = String(filename || "");
    let match = name.match(/(20\d{2})-01-01[_-](20\d{2})-12-31/);
    if (match) return match[1] === match[2] ? match[1] : match[1] + "–" + match[2];
    match = name.match(/(?:anno|annual|fiscal|periodo|period)[^0-9]{0,20}(20\d{2})/i);
    if (match) return match[1];
    match = name.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
    if (match) return match[1];
    const preamble = [];
    for (const row of rows) {
      const line = row.join(" ");
      if (/Investment Services Riepiloghi|Crypto Riepiloghi|Materia prima Riepiloghi/i.test(line)) break;
      if (/periodo|period|anno fiscale|fiscal year|dal |from |al |to /i.test(line)) preamble.push(line);
    }
    const explicitYears = [...new Set(preamble.flatMap(line => line.match(/\b20\d{2}\b/g) || []))];
    return explicitYears.length === 1 ? explicitYears[0] : "non determinato";
  }
  function metric(label,val,source,opts={}){
    const missing=val===null||val===undefined||val==="";
    const display=missing?"Non trovato nel CSV":(opts.money===false?String(val):fmt(Number(val)));
    const copiedValue = opts.money === false ? String(val) : fmt(Number(val));
    const canCopy = !missing && typeof val === "number" && opts.copy !== false;
    return `<tr><th>${esc(label)}</th><td><div class="value-line"><strong class="amount${missing?' missing-value':''}">${esc(display)}</strong>${canCopy ? `<button class="copy-button" type="button" data-copy="${esc(copiedValue)}" aria-label="Copia ${esc(label)}">Copia</button>` : ""}</div></td></tr>`;
  }
  function taxCard(title,status,body,rows){
    return `<article class="tax-card"><h3>${esc(title)}</h3>${rows?`<table class="data-table"><tbody>${rows}</tbody></table>`:''}</article>`;
  }
  function renderReport(r){
    $('#report').hidden=false;$('#report-title').textContent='Quadri fiscali';
    const portfolio=r.sections.filter(s=>s.kind==='investimenti');
        const tax=[];
    if(r.crypto){const c=r.crypto;let rows='';rows+=metric('Fondi disponibili nel riepilogo posizioni',c.endYearReported,'Crypto → Riepilogo delle posizioni di fine anno',{copy:false});rows+=metric('Saldo medio periodo',c.mean,'Crypto → Valore del deposito',{copy:false});rows+=metric('Saldo massimo',c.max,'Crypto → Valore del deposito',{copy:false});rows+=metric('Giorni di possesso',c.days,'Crypto → Dettagli del conto cripto',{money:false});tax.push(taxCard('Quadro W · cripto-attività','Da completare','Dato del riepilogo estratto. La colonna del CSV è denominata «Fondi disponibili»: non viene trattata automaticamente come valore fiscale delle cripto nel quadro W. Verifica valorizzazione, titolarità e giorni di detenzione.',rows));tax.push(taxCard('Quadro T · cessioni di cripto-attività',c.pnl!==null&&c.pnl>0?'Da verificare':'Verifica fiscale','Il riepilogo Revolut riporta il risultato economico del broker. Per determinare l’importo fiscalmente dichiarabile occorre verificare le singole cessioni, il costo fiscale e le regole applicabili all’anno d’imposta.',metric('Ricavi lordi riportati da Revolut',c.gross,'Crypto → Plusvalenze da vendita',{copy:false})+metric('Costo acquisti riportato da Revolut',c.cost,'Crypto → Plusvalenze da vendita',{copy:false})+metric('Commissioni riportate da Revolut',c.fees,'Crypto → Plusvalenze da vendita',{copy:false})+metric('Risultato netto del broker (non calcolo fiscale)',c.pnl,'Crypto → Plusvalenze da vendita',{copy:false})));if(c.learn!==null||c.staking!==null)tax.push(taxCard('Learn & Earn / staking','Da classificare','Sono proventi distinti dalle cessioni. Non vanno sommati automaticamente alle plusvalenze da vendita.',metric('Learn & Earn riportato da Revolut',c.learn,'Crypto → Reddito da attività Learn & Earn',{copy:false})+metric('Staking riportato da Revolut',c.staking,'Crypto → Reddito da staking',{copy:false})));}
    if(portfolio.length){let rows='';portfolio.forEach((s,i)=>{rows+=metric(`${s.title} · saldo medio riportato`,s.mean,`${s.title} → riepilogo conto`,{copy:false});rows+=metric(`${s.title} · saldo massimo riportato`,s.max,`${s.title} → riepilogo conto`,{copy:false});});tax.push(taxCard('Quadro W · investimenti finanziari','Da completare','Sono stati riconosciuti uno o più riepiloghi di investimento nel CSV. I valori vengono mostrati per rapporto e non sommati indiscriminatamente: per compilare il quadro occorre confermare natura del rapporto, paese di detenzione e criterio fiscale del valore.',rows));tax.push(taxCard('Dividendi e risultati delle vendite · dati sorgente','Da classificare','Gli importi aggregati del riepilogo non sono ancora attribuiti a uno specifico rigo fiscale.',metric('Dividendi aggregati rilevati',r.totals.dividends,'Investment Services + Robo-Advisor',{copy:false})+metric('Risultati netti vendite riportati dal broker',r.totals.investmentPnl,'Investment Services + Robo-Advisor',{copy:false})));}
    if(r.commodity){tax.push(taxCard('Materie prime','Dati parziali','Il CSV contiene una sezione relativa alle materie prime. Verifica le operazioni e la consistenza al 31 dicembre prima di stabilire se sussistono obblighi fiscali.',metric('Ricavo lordo vendite',r.commodity.gross,'Materia prima → Reddito relativo alle vendite')+metric('Base imponibile riportata',r.commodity.basis,'Materia prima → Reddito relativo alle vendite')+metric('Profitti/perdite realizzati',r.commodity.pnl,'Materia prima → Reddito relativo alle vendite')));}
    $('#tax-results').innerHTML=tax.join('')||'<p class="hint">Nessuna sezione fiscale riconosciuta: verifica il formato del CSV.</p>';
    $('#report').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function processFile(file){
    if(!file||!file.name.toLowerCase().endsWith('.csv'))throw new Error('Carica un file CSV. I PDF e gli XLSX non sono supportati da questo analizzatore.');
    $('#feedback').textContent='Lettura e classificazione del documento…';
    const buffer=await file.arrayBuffer();
    let text;
    try { text=new TextDecoder("utf-8",{fatal:true}).decode(buffer); }
    catch { text=new TextDecoder("windows-1252").decode(buffer); }
    const report=analyze(text,file.name);
    state.report=report;renderReport(report);
    $('#feedback').textContent=`Lettura completata: ${report.rows.toLocaleString('it-IT')} righe. I dati fiscali richiedono verifica.`;
  }
  document.addEventListener('click', async e => { const b=e.target.closest('[data-copy]'); if(!b)return; try { await navigator.clipboard.writeText(b.dataset.copy); const old=b.textContent; b.textContent='Copiato'; setTimeout(()=>{b.textContent=old;},1200); } catch { b.textContent='Copia manuale'; } });
  $('#file-input').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)processFile(f).catch(err=>$('#feedback').textContent=err.message);e.target.value='';});
  const dz=$('#dropzone');dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover')});dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');const f=e.dataTransfer.files?.[0];if(f)processFile(f).catch(err=>$('#feedback').textContent=err.message)});
$('#new-analysis').addEventListener('click',()=>{state.report=null;$('#report').hidden=true;$('#feedback').textContent='';$('#file-input').value='';$('#upload-panel').scrollIntoView({behavior:'smooth'});});
})();
