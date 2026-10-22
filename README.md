# Calcolatore tasse

Calcolatore tasse è una webapp che analizza il CSV annuale consolidato di Revolut per individuare i dati relativi agli investimenti e aiutare l’utente a capire quali importi possono servire per la dichiarazione dei redditi italiana.

## A cosa serve

L’obiettivo è ridurre il lavoro manuale necessario per passare dall’estratto Revolut ai dati utili per il modello 730. L’utente carica il CSV e riceve un riepilogo dei dati riconosciuti, organizzati per tipologia di investimento e, quando determinabile, collegati al quadro fiscale pertinente.

La webapp si concentra esclusivamente su:

- azioni;
- ETF;
- criptovalute;
- altri strumenti e prodotti d’investimento, inclusi quelli presenti nel rendiconto Revolut.

Conti correnti, spese quotidiane e altre operazioni non legate agli investimenti non sono l’obiettivo dell’analisi.

## Come funziona

1. L’utente carica il CSV annuale consolidato esportato da Revolut.
2. La webapp legge il file e individua le sezioni relative agli investimenti.
3. Estrae e organizza i dati riconosciuti, evitando di sommare riepiloghi che potrebbero riferirsi alle stesse operazioni o a prodotti diversi.
4. Mostra i risultati utili alla dichiarazione, distinguendo i valori letti dal documento da quelli che richiedono ulteriori verifiche.

## Obiettivo del progetto

Il risultato desiderato non è un semplice riepilogo dell’estratto conto: è una guida operativa che indichi, per ciascun dato fiscale individuato, **quale importo utilizzare e in quale quadro o campo della dichiarazione riportarlo**, con la possibilità di copiare il valore.

Gli importi devono essere ricostruiti in base alla natura dello strumento e alle regole fiscali applicabili. Un valore riportato dal broker, come il profitto o la perdita netta, non è automaticamente uguale all’importo da dichiarare.

## Stato e limiti

Il progetto è in sviluppo. Il riconoscimento dei dati dal CSV non garantisce, da solo, che ogni importo sia già fiscalmente definitivo o che tutti i quadri applicabili siano stati determinati. I casi ambigui devono essere segnalati, non trasformati in valori certi.

Prima di utilizzare i risultati per presentare una dichiarazione, è necessario verificarli rispetto alle istruzioni ufficiali dell’Agenzia delle Entrate e alla situazione fiscale personale.

## Privacy

L’analisi del CSV è progettata per avvenire direttamente nel browser, senza caricare il documento su un server dell’applicazione.

## Tecnologie

Webapp statica realizzata con HTML, CSS e JavaScript, senza framework obbligatori.
