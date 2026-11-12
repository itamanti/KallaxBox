# KallaxBox - Ikea Kallax Board Game Shelf Manager 🎲📦

KallaxBox è un'applicazione web moderna e interattiva progettata per gli appassionati di giochi da tavolo. Permette di organizzare, pianificare e visualizzare in 2D e 3D la disposizione reale delle scatole di giochi da tavolo all'interno dei vani di una libreria **IKEA Kallax** (vani standard 33.5 × 33.5 × 39 cm), verificando volumi, ingombri, rotazioni a 90° e compatibilità fisica.

---

## ✨ Funzionalità Principali

- 📐 **Simulatore Fisico Vani Kallax**:
  - Calcolo del volume occupato in tempo reale (%) e litri rimanenti.
  - Supporto per orientamento verticale (in costa), orizzontale (in pila) e frontale.
  - Rotazione a 90° con collision detection 2D e allineamento magnetico senza fessure.
  - Funzione **Auto-ottimizza** per massimizzare la capienza di ogni vano.
  - Lucchetto per bloccare la disposizione o abilitare la modalità libera.
- 🎨 **Visualizzazione 3D Interattiva (Three.js)**:
  - Modello 3D fotorealistico della libreria Kallax con finiture legno (Bianco, Rovere, Nero-Marrone, Grigio).
  - Rendering 3D delle scatole con colori costa realistici, ombre e tooltip con misure e provenienza.
- 🌐 **Integrazione BoardGameGeek (BGG)**:
  - Ricerca istantanea di giochi con download automatico di metadati (rating, complessità BGG, giocatori, anno, durata).
  - Importazione dell'intera collezione da username BGG ("Owned").
- 📊 **Importazione BG Stats**:
  - Supporto completo per file di backup JSON e CSV esportati dall'app BG Stats.
  - Rilevamento automatico dello stato posseduto (`statusOwned: true`, `Posseduto`, `In collezione`).
  - Filtro per tag ed esclusione automatica di Wishlist / Precedentemente posseduti.
- 🔍 **Tracciamento Provenienza Dimensioni**:
  - Visualizzazione chiara dell'origine di ogni misura (`da BGG`, `da Ricerca Web`, `da BG Stats`, `da Note BG Stats`, `da Manuale`).
  - Ricerca automatica in rete delle dimensioni della scatola per giochi non presenti a catalogo.
- 📚 **Gestione Multi-Scaffale**:
  - Creazione e configurazione di più mobili Kallax (1x1, 1x2, 2x2, 2x4, 3x3, 4x4, 5x5).
  - Salvataggio automatico locale persistente (`localStorage`).

---

## 🚀 Come avviare il progetto in locale

### 1. Prerequisiti
- **Node.js** versione 18 o superiore (consigliata 20 LTS o 22)
- **npm** (incluso con Node.js)

### 2. Installazione
Clona la repository ed entra nella cartella del progetto:

```bash
git clone https://github.com/TUO-USERNAME/kallaxbox.git
cd kallaxbox
```

Installa le dipendenze:

```bash
npm install
```

### 3. Configurazione Ambiente (Opzionale)
Copia il file `.env.example` in `.env`:

```bash
cp .env.example .env
```

Puoi facoltativamente configurare:
- `PORT`: Porta del server (predefinita `3000`).
- `GEMINI_API_KEY`: Per abilitare la ricerca con Google Search grounding tramite Gemini 3.8 Flash.
- `BGG_API_TOKEN`: Per aumentare i rate-limit delle API BoardGameGeek.

### 4. Avvio in Sviluppo
Avvia il server di sviluppo (Express + Vite con Hot Module Replacement):

```bash
npm run dev
```

Apri il browser su [http://localhost:3000](http://localhost:3000).

---

## 🛠️ Come pubblicare su GitHub

Se hai scaricato l'archivio ZIP del progetto, segui questi semplici passaggi da terminale nella cartella estratta:

```bash
# 1. Inizializza il repository git locale
git init

# 2. Aggiungi tutti i file sorgente
git add .

# 3. Effettua il primo commit
git commit -m "Initial commit - KallaxBox Board Game Shelf Manager"

# 4. Crea un nuovo repository vuoto su GitHub (es. 'kallaxbox')
# 5. Collega il remote GitHub e carica il codice (sostituisci col tuo link):
git remote add origin https://github.com/TUO-USERNAME/kallaxbox.git
git branch -M main
git push -u origin main
```

---

## 📦 Struttura del Progetto

```
├── src/
│   ├── components/            # Componenti UI React (Modali, 3D Scene, Vani 2D, Drawer)
│   │   ├── BgStatsImportModal.tsx   # Importazione export JSON/CSV BG Stats
│   │   ├── BggSearchModal.tsx       # Ricerca BGG e import collezione utente
│   │   ├── BoxEditModal.tsx         # Scheda dettagliata e modifica misure
│   │   ├── CubeDetailModal.tsx      # Gestione e disposizione scatole nel vano
│   │   ├── Kallax3DScene.tsx        # Vista tridimensionale interattiva Three.js
│   │   ├── KallaxCubeView.tsx       # Vista vano 2D con drag & drop
│   │   ├── LibraryDrawer.tsx        # Cassetto collezione giochi
│   │   ├── ShelfHeader.tsx          # Intestazione, switcher mobile e comandi
│   │   └── ...
│   ├── data/
│   │   ├── boardGameDatabase.ts     # Catalogo giochi verificati e parser misure
│   │   └── sampleGames.ts           # Giochi di esempio precaricati
│   ├── types/
│   │   └── kallax.ts                # Definizioni TypeScript (GameBox, PlacedBox, ecc.)
│   ├── utils/
│   │   ├── kallaxMath.ts            # Algoritmi calcolo vani, collisioni e parsing
│   │   └── kallaxMath.test.ts       # Test unitari suite di verifica
│   ├── App.tsx                      # Componente principale dell'applicazione
│   ├── main.tsx                     # Entry point React
│   └── index.css                    # Setup Tailwind CSS v4
├── index.html                       # HTML Template
├── server.ts                        # Server Express (API BGG, batch dimensions, web search)
├── vite.config.ts                   # Configurazione Vite
├── tsconfig.json                    # Configurazione TypeScript
├── package.json                     # Dipendenze e script
├── .gitignore                       # File ignorati da Git (node_modules, dist, .env)
└── .env.example                     # Modello variabili d'ambiente
```

---

## 🏗️ Build per la Produzione

Per compilare la versione di produzione ottimizzata:

```bash
npm run build
```

Per avviare l'applicazione compilata in produzione:

```bash
npm run start
```

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Sentiti libero di utilizzare, modificare e condividere il progetto!
