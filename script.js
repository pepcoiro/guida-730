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
    let s = String(value).trim().replace(/−/g, "-");
    // Il CSV Revolut contiene sequenze euro già decodificate male (ad es. â\x82¬).
    // Eliminarle prima di estrarre cifre evita di leggere 42,95 € come 42,9582.
    s = s.replace(/â[^\d,.-]{0,3}¬/g, "").replace(/[€$£\s\u00A0\u202F]/g, "");
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
      let raw = row[index + 1];
      // Alcune sezioni USD riportano prima l'importo in dollari e subito dopo la conversione in euro.
      if (/\$\s*$/.test(raw) && index + 2 < row.length && /(?:€|¬)\s*$/.test(row[index + 2])) {
        raw = row[index + 2];
      }
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
  function accountRecord(title, rows, kind) {
    const get = (...labels) => rowPair(rows, labels)?.value ?? null;
    const mean = get("Saldo medio per l'intero periodo", "Saldo medio dell'intero anno", "Saldo medio", "Giacenza media");
    const max = get("Saldo massimo", "Valore massimo");
    const opening = get("Saldo di apertura");
    const closing = get("Saldo di chiusura", "Saldo finale", "Valore finale");
    const days = uniquePatternNumber(rows, /Giorni di possesso/i);
    const institution = rows.find(row => /Nome dell'istituto finanziario/i.test(row[0] || ""));
    const institutionName = institution ? institution[1] : null;
    const countryRow = rows.find(row => /^Indirizzo e paese$/i.test(row[0] || ""));
    const income = {
      grossInterest: get("Introiti da interessi"),
      taxInterest: get("Ritenuta d'acconto sugli interessi"),
      grossIncome: get("Gross income"),
      netIncome: get("Net income"),
      withheld: get("Imposte trattenute"),
      invites: get("Introiti da inviti"),
      rewards: get("Rendimento delle ricompense"),
      cashback: get("Introiti da cashback"),
      dividends: get("Dividends", "Dividendi"),
      dividendTax: get("Tax withheld on dividend", "Ritenuta d'acconto sul dividendo")
    };
    const sales = {
      gross: get("Ricavo lordo"),
      cost: get("Cost basis"),
      fees: get("Commissioni e altri addebiti"),
      pnl: get("PnL al netto delle imposte")
    };
    return { title, kind, mean, max, opening, closing, days, institution: institutionName, address: countryRow?.[1] || null, income, sales, rows };
  }
  function analyze(text, filename){
    const rows=csvRows(text); if(rows.length<10)throw new Error('Il CSV è troppo corto o non è leggibile.');
    const sections=[];
    const bankStart = findSection(rows, /^Conti correnti Riepiloghi/i);
    const savingsStart = findSection(rows, /^Conti deposito Riepiloghi/i);
    const invStart=findSection(rows,/Investment Services Riepiloghi/i), cryptoStart=findSection(rows,/Crypto Riepiloghi/i), commodityStart=findSection(rows,/Materia prima Riepiloghi/i);
    const sectionEnd=(start,starts)=>starts.filter(i=>i>=0&&i>start).sort((a,b)=>a-b)[0]??rows.length;
    let bankAccounts = [];
    if (bankStart >= 0) {
      const bankEnd = sectionEnd(bankStart, [savingsStart, invStart]);
      const bankPart = rows.slice(bankStart, bankEnd);
      bankAccounts = segment(bankPart, 1, bankPart.length, [/^Conto personale \(/i, /^Spese Mensili \(/i])
        .map(block => accountRecord(block.title, block.rows, "conto"));
    }
    let savings = null;
    if (savingsStart >= 0) {
      const savingsEnd = sectionEnd(savingsStart, [invStart]);
      const savingsPart = rows.slice(savingsStart, savingsEnd);
      const block = segment(savingsPart, 1, savingsPart.length, [/^Deposito senza vincoli/i])[0];
      if (block) savings = accountRecord(block.title, block.rows, "deposito");
    }
    const invEnd=sectionEnd(invStart,[cryptoStart,commodityStart]);
    const cryptoEnd=sectionEnd(cryptoStart,[invStart,commodityStart]);
    const commodityEnd=sectionEnd(commodityStart,[invStart,cryptoStart]);
    if (invStart >= 0) {
      const part = rows.slice(invStart, invEnd);
      const segs = segment(part, 1, part.length, [/^Dettagli del conto di intermediazione/i, /^Robo-Advisor/i]);
      const hasAccountDetails = blockRows =>
        blockRows.some(row => row.some(cell => normalizedLabel(cell) === "numero di conto")) &&
        blockRows.some(row => row.some(cell => normalizedLabel(cell) === "saldo massimo"));
      for (let i = 0; i < segs.length; i++) {
        let current = segs[i];
        // In Investment Services il riepilogo delle vendite/dividendi precede i dettagli dello stesso conto.
        // Accorpa i due blocchi invece di mostrarli come due conti separati.
        if (/^Dettagli del conto di intermediazione/i.test(current.title) &&
            !hasAccountDetails(current.rows) &&
            i + 1 < segs.length &&
            /^Dettagli del conto di intermediazione/i.test(segs[i + 1].title) &&
            hasAccountDetails(segs[i + 1].rows)) {
          current = { title: current.title, rows: current.rows.concat(segs[i + 1].rows) };
          i++;
        }
        if (!hasAccountDetails(current.rows)) continue;
        let record = accountRecord(current.title, current.rows, "investimenti");
        const opened = current.rows.find(row => row.some(cell => normalizedLabel(cell) === "data di apertura"));
        const openedIndex = opened ? opened.findIndex(cell => normalizedLabel(cell) === "data di apertura") : -1;
        const openedValue = openedIndex >= 0 ? opened[openedIndex + 1] || null : null;
        const isRobo = /Robo-Advisor/i.test(current.title);
        const label = isRobo ? "Robo-Advisor" : "Conto di intermediazione";
        record = { ...record, title: openedValue ? label + " · apertura " + openedValue : label };
        sections.push(record);
      }
    }
    let crypto=null;
    if(cryptoStart>=0){const cr=rows.slice(cryptoStart,cryptoEnd);const pick=(label)=>rowPair(cr,label)?.value??null;
      const holdStart=cr.findIndex(r=>/Riepilogo delle posizioni di fine anno/i.test(r[0]||''));let holdings=[];if(holdStart>=0){for(let i=holdStart+2;i<cr.length;i++){const r=cr[i];if(/^(Totale|Valore del deposito|[-]+)$/i.test(r[0]||''))break;if(r.length>=3&&r[0]&&!/Descrizione e simbolo/i.test(r[0])){const val=r.length>3?number(r[3]):null;if(val!==null)holdings.push({asset:r[0],units:r[1],unitPrice:r[2],value:val});}}}
      const endYearTotal = holdStart >= 0 ? cr.slice(holdStart + 1).find(r => /^Totale$/i.test(r[0] || "")) || null : null;
      const endYearReported=endYearTotal?endYearTotal.slice(1).map(number).find(v=>v!==null)??null:null;
      crypto={endYearReported,opening:pick('Saldo di apertura'),gross:pick('Valore lordo delle vendite'),cost:pick("Costo dell'acquisto"),fees:pick('Commissioni e altri addebiti'),pnl:pick('Plusvalenze al netto delle imposte'),learn:pick('Entrate da attività su Learn & Earn'),staking:pick('Reddito da staking'),mean:pick("Saldo medio per l'intero periodo"),max:pick('Saldo massimo'),closing:pick('Saldo di chiusura'),days:uniquePatternNumber(cr, /Giorni di possesso/i),institution:(cr.find(r=>/Nome dell'istituto finanziario/i.test(r[0]||''))||[])[1]||null,address:(cr.find(r=>/^Indirizzo e paese$/i.test(r[0]||''))||[])[1]||null,holdings,rows:cr};
    }
    let commodity=null;
    if(commodityStart>=0){
      const cr=rows.slice(commodityStart,commodityEnd);
      const account = accountRecord("Metalli preziosi (XAU)", cr, "commodity");
      commodity={...account,gross:valueLabel(cr,'Ricavo lordo'),basis:valueLabel(cr,'Base imponibile'),pnl:valueLabel(cr,'Profitti e perdite lordi realizzati'),rows:cr};
    }
    const investmentSections = sections.filter(s => s.kind === "investimenti");
    const sumAvailable = values => {
      const present = values.filter(value => typeof value === "number" && Number.isFinite(value));
      if (!present.length) return null;
      const cents = present.reduce((sum, value) => sum + Math.round((value + Number.EPSILON) * 100), 0);
      return cents / 100;
    };
    const divs = sumAvailable(investmentSections.map(s => s.income.dividends));
    const dividendTax = sumAvailable(investmentSections.map(s => s.income.dividendTax));
    const sales = sumAvailable(investmentSections.map(s => s.sales.pnl));
    const investmentGross = sumAvailable(investmentSections.map(s => s.sales.gross));
    const investmentCost = sumAvailable(investmentSections.map(s => s.sales.cost));
    const investmentFees = sumAvailable(investmentSections.map(s => s.sales.fees));
    const accountAndDeposit = [...bankAccounts, ...(savings ? [savings] : [])];
    const bankAverageTotal = sumAvailable(accountAndDeposit.map(a => a.mean));
    const bankMaximaUpperBound = sumAvailable(accountAndDeposit.map(a => a.max));
    const inviteAmounts = [...new Set(bankAccounts.flatMap(a => [a.income.invites, a.income.rewards]).filter(v => typeof v === "number" && v !== 0))];
    const inviteRewardReported = inviteAmounts.length === 1 ? inviteAmounts[0] : null;
    const warnings=[];
    if(!crypto)warnings.push('La sezione cripto non è stata riconosciuta: verificare che il file sia un estratto consolidato Revolut completo.');
    if(sections.some(s=>s.kind==='investimenti'))warnings.push('Per gli investimenti esteri, il quadro W dipende dalla natura giuridica del rapporto, dal luogo di detenzione e dalla titolarità: il nome del broker da solo non basta a completare tutti i campi.');
    if(crypto)warnings.push('Per le cripto-attività, verificare il valore fiscale di fine anno, la titolarità, i giorni di detenzione e il criterio di valorizzazione applicabile. Il valore del riepilogo non è automaticamente il valore da dichiarare.');
    if((crypto?.learn||0)>0 || (crypto?.staking||0)>0)warnings.push('Learn & Earn e staking sono separati dalle vendite: il trattamento fiscale va determinato prima di trasferire gli importi nella dichiarazione.');
    warnings.push('Il CSV non contiene necessariamente tutti i dati fiscali storici: costi precedenti, trasferimenti in entrata, operazioni su altri broker o wallet e minusvalenze pregresse vanno verificati separatamente.');
    warnings.push('Gli importi sono estratti dal CSV e formattati senza attribuire automaticamente una valuta fiscale. Verifica la valuta originaria e le istruzioni ufficiali dell’anno d’imposta prima di usarli nella dichiarazione.');
    return {filename,rows:rows.length,sections,bankAccounts,savings,bankTotals:{average:bankAverageTotal,maximaUpperBound:bankMaximaUpperBound},inviteRewardReported,crypto,commodity,totals:{dividends:divs,dividendTax,investmentGross,investmentCost,investmentFees,investmentPnl:sales},warnings,period:detectPeriod(rows,filename)};
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
    const numericValue = Number(val);
    const roundedEuro = Math.sign(numericValue) * Math.floor(Math.abs(numericValue) + 0.5);
    const copiedValue = opts.money === false ? String(val) : String(roundedEuro);
    const canCopy = !missing && typeof val === "number" && opts.copy !== false;
    return `<tr><th>${esc(label)}</th><td><div class="value-line"><strong class="amount${missing?' missing-value':''}">${esc(display)}</strong>${canCopy ? `<button class="copy-button" type="button" data-copy="${esc(copiedValue)}" aria-label="Copia ${esc(label)}">Copia</button>` : ""}</div></td></tr>`;
  }
  function taxCard(title,status,body,rows){
    return `<article class="tax-card"><h3>${esc(title)}</h3>${rows?`<table class="data-table"><tbody>${rows}</tbody></table>`:''}</article>`;
  }
  function renderReport(r) {
    $('#report').hidden = false;
    $('#report-title').textContent = 'Quadri fiscali';
    const portfolio = r.sections.filter(section => section.kind === "investimenti");
    const tax = [];

    if (r.bankTotals && r.bankTotals.average !== null) {
      const rows =
        metric("Giacenza media aggregata conti e deposito", r.bankTotals.average, null, {copy:false}) +
        metric("Somma dei saldi massimi dei singoli conti", r.bankTotals.maximaUpperBound, null, {copy:false});
      tax.push(taxCard("Conti correnti e deposito · verifica soglie", "", "Valori aggregati per verificare le soglie dei conti esteri; non sono campi da copiare nel 730.", rows));
    }

    if (r.savings) {
      const rows =
        metric("Interessi lordi del deposito", r.savings.income.grossIncome, null, {copy:false}) +
        metric("Imposte trattenute secondo Revolut", r.savings.income.withheld, null, {copy:false}) +
        metric("Interessi netti dichiarati da Revolut", r.savings.income.netIncome, null, {copy:false});
      tax.push(taxCard("Deposito · interessi già riportati nel riepilogo", "", "Il CSV indica una ritenuta: non duplicare l'importo senza verificare che sia una ritenuta italiana a titolo d'imposta.", rows));
    }

    if (r.crypto) {
      const c = r.crypto;
      const wRows =
        metric("Valore iniziale cripto", c.opening, null) +
        metric("Valore finale delle posizioni al 31/12", c.endYearReported, null) +
        metric("Giorni di detenzione", c.days, null, {money:false});
      tax.push(taxCard("Quadro W · cripto-attività", "", "", wRows));

      const cryptoCostIncludingFees =
        c.cost !== null && c.fees !== null ? Math.round((c.cost + c.fees + Number.EPSILON) * 100) / 100 : null;
      const tRows =
        metric("Corrispettivi delle cessioni cripto", c.gross, null) +
        metric("Costo d'acquisto comprensivo dei costi indicati da Revolut", cryptoCostIncludingFees, null) +
        metric("Risultato netto riepilogato da Revolut", c.pnl, null, {copy:false});
      tax.push(taxCard("Quadro T · cessioni di cripto-attività", "", "Corrispettivi e costo sono dati del riepilogo Revolut; il risultato netto risulta negativo.", tRows));

      if (c.learn !== null || c.staking !== null) {
        const rows =
          metric("Learn & Earn dichiarato da Revolut", c.learn, null, {copy:false}) +
          metric("Proventi da staking dichiarati da Revolut", c.staking, null, {copy:false});
        tax.push(taxCard("Proventi cripto non sommati alle cessioni", "", "Il CSV distingue i proventi da Learn & Earn e staking dal risultato delle vendite; non li compenso automaticamente con la minusvalenza.", rows));
      }
    }

    if (portfolio.length) {
      let accountRows = "";
      for (const account of portfolio) {
        accountRows += metric(account.title + " · saldo iniziale", account.opening, null, {copy:false});
        accountRows += metric(account.title + " · saldo di chiusura", account.closing, null, {copy:false});
        accountRows += metric(account.title + " · saldo medio", account.mean, null, {copy:false});
        accountRows += metric(account.title + " · saldo massimo", account.max, null, {copy:false});
      }
      accountRows += metric("Valore complessivo dei titoli al 31/12 (presente nel CSV)", null, null, {copy:false});
      tax.push(taxCard("Portafogli Revolut Securities · saldi del conto", "", "Questi sono saldi di conto, non il valore fiscale complessivo dei titoli detenuti al 31/12; il CSV non riporta un prospetto completo delle posizioni di fine anno.", accountRows));

      const direct = portfolio.find(account => !/^Robo-Advisor/i.test(account.title));
      if (direct && direct.sales.gross !== null && direct.sales.cost !== null) {
        const rows =
          metric("Corrispettivi vendita azioni", direct.sales.gross, null) +
          metric("Costo di acquisto", direct.sales.cost, null) +
          metric("Risultato netto riportato", direct.sales.pnl, null, {copy:false});
        tax.push(taxCard("Quadro T · vendita di strumenti finanziari", "", "Valori della vendita individuale riportata nel conto di intermediazione.", rows));
      }

      const robo = portfolio.filter(account => /^Robo-Advisor/i.test(account.title));
      if (robo.length) {
        const gross = r.totals.investmentGross;
        const cost = r.totals.investmentCost;
        const fees = r.totals.investmentFees;
        const net = r.totals.investmentPnl;
        const rows =
          metric("Corrispettivi vendite Robo-Advisor aggregati", gross, null, {copy:false}) +
          metric("Costi d'acquisto aggregati", cost, null, {copy:false}) +
          metric("Commissioni e altri addebiti", fees, null, {copy:false}) +
          metric("Risultato netto aggregato del broker", net, null, {copy:false});
        tax.push(taxCard("Robo-Advisor · risultato da classificare", "", "Il CSV aggrega più ETF, inclusi fondi obbligazionari: non copio il risultato netto in un unico rigo fiscale senza il dettaglio fiscale dei fondi.", rows));
      }

      const dividendRows =
        metric("Proventi lordi da dividendi/ETF esteri", r.totals.dividends, null) +
        metric("Ritenute indicate da Revolut", r.totals.dividendTax, null, {copy:false});
      tax.push(taxCard("Proventi da investimenti esteri · Quadro M da verificare", "", "Il totale è ricavato dai riepiloghi dei due portafogli Robo-Advisor. Il CSV indica zero ritenute ma non fornisce la ripartizione fiscale dei fondi obbligazionari.", dividendRows));
    }

    if (r.commodity) {
      const rows =
        metric("Valore iniziale metalli preziosi", r.commodity.opening, null) +
        metric("Valore finale metalli preziosi", r.commodity.closing, null) +
        metric("Ricavi lordi da vendita", r.commodity.gross, null, {copy:false}) +
        metric("Base imponibile riportata", r.commodity.basis, null, {copy:false}) +
        metric("Profitti/perdite realizzati", r.commodity.pnl, null, {copy:false});
      tax.push(taxCard("Quadro W · metalli preziosi detenuti tramite Revolut Ltd", "", "Valore finale tratto dal saldo del conto XAU; non risultano vendite di materie prime nel riepilogo 2025.", rows));
    }

    if (r.inviteRewardReported !== null) {
      tax.push(taxCard("Inviti e ricompense · da classificare", "", "Nel riepilogo compaiono lo stesso importo in due etichette; non li sommo per evitare un doppio conteggio.", metric("Importo segnalato da Revolut", r.inviteRewardReported, null, {copy:false})));
    }

    $('#tax-results').innerHTML = tax.join('') || '<p class="hint">Nessuna sezione fiscale riconosciuta: verifica il formato del CSV.</p>';
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
