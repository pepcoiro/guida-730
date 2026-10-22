(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const state = { report:null };
  const fmt = n => new Intl.NumberFormat("it-IT", {minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function csvRows(text) {
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++) { const c=text[i],n=text[i+1];
      if(c==='"' && quoted && n==='"'){cell+='"';i++;}
      else if(c==='"') quoted=!quoted;
      else if(c===',' && !quoted){row.push(cell);cell="";}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell="";}
      else cell+=c;
    }
    if(cell.length||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);}
    return rows.map(r=>r.map(cleanText));
  }
  function cleanText(s){return String(s??"").replace(/^\\uFEFF/,"").trim();}
  function number(v){
    if(v==null)return null;
    let s=String(v).trim().replace(/−/g,"-").replace(/[€$£\s]/g,"");
    if(!s||s==="-"||s==="–")return null;
    const negative=/^\(.*\)$/.test(s);
    if(negative)s=s.slice(1,-1);
    s=s.replace(/[^0-9,.-]/g,"");
    if(!s||s==="-"||s===".")return null;
    const comma=s.lastIndexOf(","), dot=s.lastIndexOf(".");
    if(comma>=0&&dot>=0){
      s=comma>dot?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");
    } else if(comma>=0){
      s=s.replace(/\./g,"").replace(",",".");
    } else if(dot>=0){
      const parts=s.split(".");
      const groupedThousands=parts.length>1 &&
        /^\d{1,3}$/.test(parts[0]) &&
        parts.slice(1).every(part=>/^\d{3}$/.test(part)) &&
        !/^0+$/.test(parts[0]);
      if(groupedThousands) s=parts.join("");
    }
    const n=Number(s);
    return Number.isFinite(n)?(negative?-n:n):null;
  }
  function valueLabel(rows,label,within){for(const r of rows){if(within&&!within(r))continue;const i=r.findIndex(x=>x.toLocaleLowerCase('it')===label.toLocaleLowerCase('it'));if(i>=0){const v=number(r[i+1]);if(v!==null)return v;}}return null;}
  function rowPair(rows,label){for(const r of rows){const i=r.findIndex(x=>x.toLocaleLowerCase('it')===label.toLocaleLowerCase('it'));if(i>=0){const raw=r[i+1];const val=number(raw);if(val!==null)return {value:val,raw:raw,row:r};}}return null;}
  function findSection(rows, regex, from=0){for(let i=from;i<rows.length;i++){if(regex.test(rows[i][0]||''))return i;}return -1;}
  function segment(rows,start,end,starts){const out=[];let current=null;for(let i=start;i<end;i++){const r=rows[i],first=r[0]||'';if(starts.some(re=>re.test(first))){if(current)out.push(current);current={title:first,rows:[r],start:i};}else if(current)current.rows.push(r);}if(current)out.push(current);return out;}
  function accountRecord(title,rows,kind){
    const get=(label)=>rowPair(rows,label)?.value ?? null;
    const mean = get("Saldo medio per l'intero periodo") ?? get("Saldo medio dell'intero anno");
    const max = get("Saldo massimo");
    const closing = get("Saldo di chiusura");
    const days = rows.map(r=>{const i=r.findIndex(x=>/Giorni di possesso/i.test(x));return i>=0?number(r[i+1]):null}).find(v=>v!==null) ?? null;
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
    const invEnd=cryptoStart>0?cryptoStart:rows.length, cryptoEnd=commodityStart>0?commodityStart:rows.length;
    if(invStart>=0){const part=rows.slice(invStart,invEnd);const segs=segment(part,1,part.length,[/^Dettagli del conto di intermediazione/i,/^Robo-Advisor/i]);segs.forEach(s=>sections.push(accountRecord(s.title,s.rows,'investimenti')));}
    let crypto=null;
    if(cryptoStart>=0){const cr=rows.slice(cryptoStart,cryptoEnd);const pick=(label)=>rowPair(cr,label)?.value??null;
      const holdStart=cr.findIndex(r=>/Riepilogo delle posizioni di fine anno/i.test(r[0]||''));let holdings=[];if(holdStart>=0){for(let i=holdStart+2;i<cr.length;i++){const r=cr[i];if(/^(Totale|Valore del deposito|[-]+)$/i.test(r[0]||''))break;if(r.length>=3&&r[0]&&!/Descrizione e simbolo/i.test(r[0])){const val=r.length>3?number(r[3]):null;if(val!==null)holdings.push({asset:r[0],units:r[1],unitPrice:r[2],value:val});}}}
      const endYearTotal=cr.find(r=>/^Totale$/i.test(r[0]||'') && cr.indexOf(r)>holdStart);
      const endYearReported=endYearTotal?endYearTotal.slice(1).map(number).find(v=>v!==null)??null:null;
      crypto={endYearReported,gross:pick('Valore lordo delle vendite'),cost:pick("Costo dell'acquisto"),fees:pick('Commissioni e altri addebiti'),pnl:pick('Plusvalenze al netto delle imposte'),learn:pick('Entrate da attività su Learn & Earn'),staking:pick('Reddito da staking'),mean:pick("Saldo medio per l'intero periodo"),max:pick('Saldo massimo'),closing:pick('Saldo di chiusura'),days:cr.map(r=>{const i=r.findIndex(x=>/Giorni di possesso/i.test(x));return i>=0?number(r[i+1]):null}).find(v=>v!==null)??null,institution:(cr.find(r=>/Nome dell'istituto finanziario/i.test(r[0]||''))||[])[1]||null,address:(cr.find(r=>/^Indirizzo e paese$/i.test(r[0]||''))||[])[1]||null,holdings,rows:cr};
    }
    let commodity=null;
    if(commodityStart>=0){const cr=rows.slice(commodityStart);commodity={gross:valueLabel(cr,'Ricavo lordo'),basis:valueLabel(cr,'Base imponibile'),pnl:valueLabel(cr,'Profitti e perdite lordi realizzati'),rows:cr};}
    const divs=sections.filter(s=>s.kind==='investimenti').reduce((a,s)=>a+(s.income.dividends||0),0);
    const sales=sections.filter(s=>s.kind==='investimenti').reduce((a,s)=>a+(s.sales.pnl||0),0);
    const warnings=[];
    if(!crypto)warnings.push('La sezione cripto non è stata riconosciuta: verificare che il file sia un estratto consolidato Revolut completo.');
    if(sections.some(s=>s.kind==='investimenti'))warnings.push('Per gli investimenti esteri, il quadro W dipende dalla natura giuridica del rapporto, dal luogo di detenzione e dalla titolarità: il nome del broker da solo non basta a completare tutti i campi.');
    if(crypto)warnings.push('Per le cripto-attività, verificare il valore fiscale di fine anno, la titolarità, i giorni di detenzione e il criterio di valorizzazione applicabile. Il valore del riepilogo non è automaticamente il valore da dichiarare.');
    if((crypto?.learn||0)>0 || (crypto?.staking||0)>0)warnings.push('Learn & Earn e staking sono separati dalle vendite: il trattamento fiscale va determinato prima di trasferire gli importi nella dichiarazione.');
    warnings.push('Il CSV non contiene necessariamente tutti i dati fiscali storici: costi precedenti, trasferimenti in entrata, operazioni su altri broker o wallet e minusvalenze pregresse vanno verificati separatamente.');
    warnings.push('Gli importi sono estratti dal CSV e formattati senza attribuire automaticamente una valuta fiscale. Verifica la valuta originaria e le istruzioni ufficiali dell’anno d’imposta prima di usarli nella dichiarazione.');
    return {filename,rows:rows.length,sections,crypto,commodity,totals:{dividends:divs,investmentPnl:sales},warnings,period:detectPeriod(rows,filename)};
  }
  function detectPeriod(rows,filename){const m=filename.match(/(20\d{2})-01-01_(20\d{2})-12-31/);if(m)return m[1]===m[2]?m[1]:`${m[1]}–${m[2]}`;for(const r of rows){const s=r.join(' ');const x=s.match(/(20\d{2})/);if(x)return x[1];}return 'non determinato';}
  function metric(label,val,source,opts={}){
    const missing=val===null||val===undefined||val==="";
    const display=missing?"Non trovato nel CSV":(opts.money===false?String(val):fmt(Number(val)));
    return `<tr><th>${esc(label)}</th><td><strong class="amount${missing?' missing-value':''}">${esc(display)}</strong>${source?`<span class="source">Fonte: ${esc(source)}</span>`:''}</td></tr>`;
  }
  function taxCard(title,status,body,rows){
    const readyStatuses=["Dati estratti","Importi estratti"];
    const statusClass=readyStatuses.includes(status)?"ready":status==="Da completare"?"missing":"check";
    return `<article class="tax-card"><div class="tax-card-head"><h3>${esc(title)}</h3><span class="status ${statusClass}">${esc(status)}</span></div>${body?`<p>${esc(body)}</p>`:''}${rows?`<table class="data-table"><tbody>${rows}</tbody></table>`:''}</article>`;
  }
  function renderReport(r){
    $('#report').hidden=false;$('#report-title').textContent=`Investimenti · ${r.period}`;$('#report-subtitle').textContent=`${r.filename} · ${r.rows.toLocaleString('it-IT')} righe lette`;
    const portfolio=r.sections.filter(s=>s.kind==='investimenti');
        const tax=[];
    if(r.crypto){const c=r.crypto;let rows='';rows+=metric('Fondi disponibili nel riepilogo posizioni',c.endYearReported,'Crypto → Riepilogo delle posizioni di fine anno');rows+=metric('Saldo medio periodo',c.mean,'Crypto → Valore del deposito');rows+=metric('Saldo massimo',c.max,'Crypto → Valore del deposito');rows+=metric('Giorni di possesso',c.days,'Crypto → Dettagli del conto cripto',{money:false});rows+=metric('Plusvalenze nette secondo Revolut',c.pnl,'Crypto → Plusvalenze da vendita');tax.push(taxCard('Quadro W · cripto-attività','Da completare','Dato del riepilogo estratto. La colonna del CSV è denominata «Fondi disponibili»: non viene trattata automaticamente come valore fiscale delle cripto nel quadro W. Verifica valorizzazione, titolarità e giorni di detenzione.',rows));tax.push(taxCard('Quadro T · cessioni di cripto-attività',c.pnl!==null&&c.pnl>0?'Da verificare':'Verifica fiscale','Il riepilogo Revolut riporta il risultato economico del broker. Per determinare l’importo fiscalmente dichiarabile occorre verificare le singole cessioni, il costo fiscale e le regole applicabili all’anno d’imposta.',metric('Ricavi lordi',c.gross,'Crypto → Plusvalenze da vendita')+metric('Costo acquisti',c.cost,'Crypto → Plusvalenze da vendita')+metric('Commissioni e altri addebiti',c.fees,'Crypto → Plusvalenze da vendita')+metric('Risultato netto del broker',c.pnl,'Crypto → Plusvalenze da vendita')));if(c.learn!==null||c.staking!==null)tax.push(taxCard('Learn & Earn / staking','Da classificare','Sono proventi distinti dalle cessioni. Non vanno sommati automaticamente alle plusvalenze da vendita.',metric('Learn & Earn',c.learn,'Crypto → Reddito da attività Learn & Earn')+metric('Staking',c.staking,'Crypto → Reddito da staking')));}
    if(portfolio.length){let rows='';portfolio.forEach((s,i)=>{rows+=metric(`${s.title} · saldo medio`,s.mean,`${s.title} → riepilogo conto`);rows+=metric(`${s.title} · saldo massimo`,s.max,`${s.title} → riepilogo conto`);});tax.push(taxCard('Quadro W · investimenti finanziari','Da completare','Sono stati riconosciuti uno o più riepiloghi di investimento nel CSV. I valori vengono mostrati per rapporto e non sommati indiscriminatamente: per compilare il quadro occorre confermare natura del rapporto, paese di detenzione e criterio fiscale del valore.',rows));tax.push(taxCard('Quadro T / redditi di capitale · investimenti','Importi estratti','Il CSV contiene riepiloghi di vendite e dividendi. La classificazione finale dipende dallo strumento, dalla fonte del reddito e dal regime fiscale applicato dal broker.',metric('Dividendi aggregati nei riepiloghi',r.totals.dividends,'Investment Services + Robo-Advisor')+metric('Risultati netti vendite aggregati',r.totals.investmentPnl,'Investment Services + Robo-Advisor')));}
    if(r.commodity){tax.push(taxCard('Materie prime','Dati parziali','Il CSV contiene una sezione relativa alle materie prime. Verifica le operazioni e la consistenza al 31 dicembre prima di stabilire se sussistono obblighi fiscali.',metric('Ricavo lordo vendite',r.commodity.gross,'Materia prima → Reddito relativo alle vendite')+metric('Base imponibile riportata',r.commodity.basis,'Materia prima → Reddito relativo alle vendite')+metric('Profitti/perdite realizzati',r.commodity.pnl,'Materia prima → Reddito relativo alle vendite')));}
    $('#tax-results').innerHTML=tax.join('')||'<p class="hint">Nessuna sezione fiscale riconosciuta: verifica il formato del CSV.</p>';
    $('#product-results').innerHTML=r.sections.filter(s=>s.kind==='investimenti').map(s=>{const rows=metric('Istituto',s.institution,'Dati conto',{money:false})+metric('Indirizzo indicato',s.address,'Dati istituto',{money:false})+metric('Giorni di possesso',s.days,'Dettagli del conto',{money:false})+metric('Saldo medio periodo',s.mean,'Valore del deposito')+metric('Saldo massimo',s.max,'Valore del deposito')+metric('Saldo di chiusura',s.closing,'Valore del deposito')+metric('Interessi lordi',s.income.grossInterest,'Introiti generati')+metric('Dividendi',s.income.dividends,'Riepilogo dividendi')+metric('Ricavo lordo vendite',s.sales.gross,'Reddito relativo alle vendite')+metric('Costo acquisti',s.sales.cost,'Reddito relativo alle vendite')+metric('Risultato netto vendite',s.sales.pnl,'Reddito relativo alle vendite');return `<article class="product-card"><div class="product-head"><h3>${esc(s.title)}</h3><span class="tag">${esc(s.kind)}</span></div><table class="data-table"><tbody>${rows||'<tr><td>Nessun importo riepilogativo riconosciuto.</td></tr>'}</tbody></table></article>`;}).join('')+(r.crypto?`<article class="product-card"><div class="product-head"><h3>Crypto</h3><span class="tag">Cripto-attività</span></div><table class="data-table"><tbody>${metric('Istituto',r.crypto.institution,'Crypto → Informazioni istituto',{money:false})}${metric('Indirizzo',r.crypto.address,'Crypto → Informazioni istituto',{money:false})}${metric('Saldo medio',r.crypto.mean,'Crypto → Valore deposito')}${metric('Saldo massimo',r.crypto.max,'Crypto → Valore deposito')}${metric('Saldo chiusura',r.crypto.closing,'Crypto → Valore deposito')}${metric('Vendite lorde',r.crypto.gross,'Crypto → Plusvalenze da vendita')}${metric('Costo acquisti',r.crypto.cost,'Crypto → Plusvalenze da vendita')}${metric('Commissioni',r.crypto.fees,'Crypto → Plusvalenze da vendita')}${metric('P/L netto',r.crypto.pnl,'Crypto → Plusvalenze da vendita')}${metric('Learn & Earn',r.crypto.learn,'Crypto → Learn & Earn')}${metric('Staking',r.crypto.staking,'Crypto → Staking')}</tbody></table><h4>Consistenze di fine anno</h4><table class="data-table"><tbody>${r.crypto.holdings.map(h=>`<tr><th>${esc(h.asset)} <span class="source">Quantità: ${esc(h.units)}</span></th><td><strong>${fmt(h.value)}</strong><span class="source">Fondi disponibili riportati · prezzo unitario: ${esc(h.unitPrice)}</span></td></tr>`).join('')}</tbody></table></article>`:'')+(r.commodity?`<article class="product-card"><div class="product-head"><h3>Materie prime</h3><span class="tag">Riepilogo</span></div><table class="data-table"><tbody>${metric('Ricavo lordo',r.commodity.gross,'Materia prima')}${metric('Base imponibile',r.commodity.basis,'Materia prima')}${metric('Profitti/perdite realizzati',r.commodity.pnl,'Materia prima')}</tbody></table></article>`:'');
    $('#warnings').innerHTML=r.warnings.map(w=>`<li>${esc(w)}</li>`).join('');$('#report').scrollIntoView({behavior:'smooth',block:'start'});
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
  function exportCSV(){if(!state.report)return;const r=state.report;const rows=[['Sezione','Campo','Valore','Fonte / nota']];for(const s of r.sections){rows.push([s.title,'Istituto',s.institution||'', 'Dettagli del conto']);for(const [label,val,src] of [['Saldo medio',s.mean,'Valore del deposito'],['Saldo massimo',s.max,'Valore del deposito'],['Saldo di chiusura',s.closing,'Valore del deposito'],['Interessi lordi',s.income.grossIncome??s.income.grossInterest,'Riepilogo interessi'],['Imposte trattenute',s.income.withheld,'Riepilogo interessi'],['Dividendi lordi',s.income.dividends,'Riepilogo dividendi'],['Ritenuta estera sui dividendi',s.income.dividendTax,'Riepilogo dividendi'],['Ricavo lordo vendite',s.sales.gross,'Riepilogo vendite'],['Costo acquisti',s.sales.cost,'Riepilogo vendite'],['P/L netto',s.sales.pnl,'Riepilogo vendite']])if(val!==null&&val!==undefined)rows.push([s.title,label,val,src]);}if(r.crypto)for(const [label,val] of [['Totale riepilogo fine anno',r.crypto.endYearReported],['Saldo medio',r.crypto.mean],['Saldo massimo',r.crypto.max],['Ricavi vendite',r.crypto.gross],['Costo acquisti',r.crypto.cost],['Commissioni',r.crypto.fees],['P/L netto',r.crypto.pnl],['Learn & Earn',r.crypto.learn],['Staking',r.crypto.staking]])if(val!==null&&val!==undefined)rows.push(['Crypto',label,val,'Crypto Riepiloghi']);const safeCell=v=>{
      let s;
      if(typeof v==="number" && Number.isFinite(v)) {
        s=new Intl.NumberFormat("it-IT",{useGrouping:false,maximumFractionDigits:12}).format(v);
      } else {
        s=String(v??"");
        if(/^\s*[=+@-]/.test(s)) s="'"+s;
      }
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const csv=rows.map(row=>row.map(safeCell).join(';')).join('\r\n');download(`guida-730-${r.period}.csv`,'\ufeff'+csv,'text/csv;charset=utf-8');}
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#file-input').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)processFile(f).catch(err=>$('#feedback').textContent=err.message);e.target.value='';});
  const dz=$('#dropzone');dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover')});dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');const f=e.dataTransfer.files?.[0];if(f)processFile(f).catch(err=>$('#feedback').textContent=err.message)});
  $('#export-report').addEventListener('click',exportCSV);$('#new-analysis').addEventListener('click',()=>{state.report=null;$('#report').hidden=true;$('#feedback').textContent='';$('#file-input').value='';$('#upload-panel').scrollIntoView({behavior:'smooth'});});
})();
