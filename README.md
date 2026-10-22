# Guida 730

Guida 730 è una webapp che analizza il CSV annuale consolidato di Revolut per individuare i dati relativi agli investimenti utili alla dichiarazione dei redditi italiana.

## Scopo

L’utente carica il CSV e riceve un report dei dati riconosciuti, organizzati per tipologia di investimento e collegati ai quadri fiscali pertinenti quando è possibile determinarli.

L’analisi riguarda esclusivamente:

- azioni;
- ETF;
- criptovalute;
- altri strumenti e prodotti d’investimento presenti nel rendiconto Revolut.

Conti correnti, spese quotidiane e operazioni non legate agli investimenti sono fuori dall’obiettivo della webapp.

## Funzionamento previsto

1. Caricare il CSV annuale consolidato esportato da Revolut.
2. Individuare le sezioni del documento relative agli investimenti.
3. Estrarre e organizzare i dati riconosciuti senza sommare indiscriminatamente riepiloghi di prodotti diversi o potenzialmente duplicati.
4. Mostrare quali dati possono servire per la dichiarazione e quali richiedono una verifica.
5. Guidare l’utente verso gli importi e i campi dei quadri fiscali pertinenti, con valori copiabili quando il calcolo è stato determinato.

## Obiettivo

La webapp non deve limitarsi a riassumere l’estratto conto. L’obiettivo è indicare all’utente quali importi riportare nei quadri e nei campi della dichiarazione dei redditi, sulla base delle operazioni e delle regole fiscali applicabili.

I valori del broker — per esempio profitto, perdita o controvalore delle vendite — non devono essere considerati automaticamente equivalenti agli importi fiscalmente dichiarabili.

## Stato del progetto

Il progetto è in sviluppo. Il riconoscimento di un valore nel CSV non significa necessariamente che l’importo sia già pronto per la dichiarazione. I casi ambigui e le informazioni mancanti devono essere segnalati chiaramente, senza presentare stime come risultati fiscali certi.

I risultati devono essere verificati rispetto alle istruzioni ufficiali dell’Agenzia delle Entrate e alla situazione fiscale personale prima di essere utilizzati per presentare la dichiarazione.

## Privacy e tecnologie

L’analisi del CSV è progettata per avvenire direttamente nel browser, senza inviare il documento a un server dell’applicazione.

La webapp è realizzata con HTML, CSS e JavaScript.
