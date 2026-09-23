# PLAN — CapaFlow v1 (Neon Party)

> Version 1.0 · validée par l'utilisateur le 2026-09-22 · **source de vérité unique**.
> Toute modification exige l'accord explicite de l'utilisateur et une ligne datée dans le §14.

## 1. Contexte et contraintes

| Élément | Valeur |
|---|---|
| Événement | Neon Party (Hi.Events, id 10807), cafétéria de l'école |
| Horaire | ven. 25 sept. 2026 19:00 → sam. 26 sept. 03:00, fuseau `America/Toronto` (confirmé via Hi.Events) |
| Capacité C | 255 par défaut, modifiable en direct de 1 à 300 (maximum de la salle) |
| Billets prévente (T) | 255 = **166 étudiants** (gratuits, liste « Checkin étudiant ») + **89 réguliers** (payants, liste « Checkin régulière ») |
| Qui compte dans la salle | Détenteurs de billets, acheteurs à la porte et **staff** : un seul compteur |
| Réentrée | Bracelet |
| Entrée avec billet | **Scan Hi.Events uniquement**, aucun clic dans l'app |
| Vente à la porte | Comptant ou terminal, **hors Hi.Events** ; prix de base 5 $ étudiant, 15 $ autre ; prix appliqués **automatiques** (suggestion du moteur) par défaut, que le Manager ou l'Admin peut **figer** |
| Forme | **Page web** ouverte dans le navigateur, sans installation |
| Appareils connectés | **6 au maximum** en même temps |
| Coût | **0 $** : GitHub Pages (repo public) + Firebase Spark + Cloudflare Workers Free |

## 2. Objectifs

1. Compter l'occupation en temps réel depuis plusieurs téléphones, même avec un réseau instable.
2. Afficher à tout moment **V**, le nombre de billets vendables à la porte, en protégeant les détenteurs de prévente à 95 %.
3. Appliquer automatiquement un prix dynamique selon V et l'heure ; le Manager ou l'Admin peut le figer.
4. Gérer les accès par rôle.

**Hors périmètre v1 (interdit sans accord)** : multi-organisation/SaaS, facturation, paiement en ligne, scan QR dans l'app, webhooks Hi.Events, Cloud Functions, plan Blaze, notifications push, export comptable, autre langue que le français.

## 3. Stack imposée

| Couche | Choix |
|---|---|
| Frontend | React + Vite + TypeScript, **page web sans installation** : cache hors ligne par service worker (`vite-plugin-pwa`, sans manifeste ni icônes d'installation), React Router en **HashRouter**, `base: '/capaflow/'` |
| Données | Firebase JS SDK modulaire : Auth (courriel + mot de passe) ; Firestore avec `persistentLocalCache` + `persistentMultipleTabManager`, région `northamerica-northeast1` (Montréal) |
| Hi.Events | Cloudflare Worker en TypeScript (Wrangler), nom `capaflow-hievents` |
| Tests | Vitest (moteur, intégration) ; `@testing-library/react` + jsdom (parcours d'écran) ; `@firebase/rules-unit-testing` + Firebase Emulator (règles) |
| CI/CD | GitHub Actions → GitHub Pages (`actions/deploy-pages`) |
| Outils locaux | Node LTS, npm, firebase-tools, wrangler, JDK 21 (émulateur) |

Aucune autre dépendance d'exécution sans accord. UUID : `crypto.randomUUID()`. Style : CSS simple, sans bibliothèque d'interface.

## 4. Architecture

```
Téléphones (page web, GitHub Pages)
  ├─ Firestore (temps réel + hors ligne) : users, event, private, shards, money, log
  └─ toutes les 15 s → Worker capaflow-hievents → api.hi.events (2 listes de check-in)
```

- Aucun serveur applicatif. Le moteur (§9) tourne dans chaque navigateur.
- La sécurité repose sur les règles Firestore (§8).

Structure du dépôt :

```
capaflow/
├── CLAUDE.md · PLAN.md
├── app/                    React + Vite PWA
│   └── src/
│       ├── engine/         computeState() pur + tests (aucun import Firebase)
│       ├── data/           Firebase : init, auth, lectures, écritures en lot
│       ├── hievents/       appel périodique du Worker
│       ├── alerts/         alertes sonores et vibration (Manager, Admin)
│       └── screens/        Connexion, Porte, Tableau, Gestion + tests d'écran
├── worker/                 Cloudflare Worker
├── firebase/               firestore.rules, firebase.json, tests des règles
└── .github/workflows/      deploy.yml
```

## 5. Rôles

| Action | Admin | Manager | Bouncer | Viewer |
|---|:-:|:-:|:-:|:-:|
| Tableau de bord complet (V, prix, réserve, revenus) | ✓ | ✓ | — | — |
| Tableau de bord réduit : salle O/C, billets étudiants et réguliers scannés, alerte de capacité | ✓ | ✓ | — | ✓ |
| Écran Porte : Sortie, Réentrée, Vente, Staff | ✓ | ✓ | ✓ | — |
| Annuler **son** dernier clic (≤ 30 s) | ✓ | ✓ | ✓ | — |
| Annuler n'importe quel clic | ✓ | ✓ | — | — |
| Ajustement ±n (1 à 50, motif obligatoire) | ✓ | ✓ | — | — |
| Capacité, ventes ouvertes/fermées, forçage, paramètres, prix | ✓ | ✓ | — | — |
| Journal | ✓ | ✓ | — | — |
| Comptes : créer, changer le rôle, désactiver | ✓ | — | — | — |

- Connexion par identifiant, converti en courriel technique `<identifiant>@example.com` (aucun courriel envoyé). Mot de passe de 6 caractères minimum.
- Premier Admin : créé à la main dans la console Firebase (compte Auth + document `/users/{uid}` avec `role: "admin"`).
- Les autres comptes sont créés depuis l'app via une **2e instance Firebase**, pour que l'Admin reste connecté.
- Désactiver un compte = `role: "disabled"`. Mot de passe oublié : créer un nouveau compte et désactiver l'ancien (sans serveur, on ne peut pas changer le mot de passe d'un autre).
- Après connexion : Bouncer → `#/porte` ; Viewer, Manager et Admin → `#/tableau`.

## 6. Écrans (thème sombre à fort contraste, textes en français)

Couleurs : fond `#0B0B0F`, surfaces `#17171F`, texte `#F5F5F7`, vert `#22C55E`, jaune `#FACC15`, rouge `#EF4444`, accent `#A855F7`.

### 6.1 Porte (`#/porte`)

```
┌─────────────────────────────┐
│ 195/255    🟡    ● en ligne  │
├──────────────┬──────────────┤
│   − SORTIE   │  ↺ RÉENTRÉE  │
│              │   bracelet   │
├──────────────┴──────────────┤
│           $ VENTE           │
│        8 $   ·   23 $       │
└─────────────────────────────┘
  [ Staff ]     [ Annuler dernier ]
```

- Les deux rangées de zones occupent toute la largeur, chacune ≥ 30 % de la hauteur de l'écran. Occupation affichée en ≥ 48 px.
- Chaque clic : flash de 300 ms (vert pour +, rouge pour −) et vibration de 30 ms si le téléphone la supporte (Android).
- L'écran reste allumé (Wake Lock, redemandé au retour sur la page).
- **Alerte de capacité** : si O ≥ C, un bandeau rouge clignotant s'affiche sous l'en-tête (« SALLE PLEINE » si O = C, « DÉPASSEMENT : +N » si O > C) et l'occupation passe en rouge. L'app ne bloque pas les entrées (les scans se font dans Hi.Events) ; la vente est déjà `COMPLET` car V ≤ 0.
- **Âge** : ligne sous l'en-tête, calculée à partir du 25 sept. 2026 : « 18 ans + : né(e) le 25/09/2008 ou avant · 17 ans + : né(e) le 25/09/2009 ou avant » (format jj/mm/aaaa).
- **Check-in** : boutons « Check-in étudiant ↗ » et « Check-in régulier ↗ » au-dessus de « + Staff », qui ouvrent les pages de check-in Hi.Events dans un nouvel onglet. Toujours affichés ; grisés avec « lien à configurer » tant que l'Admin n'a pas enregistré le lien (§6.3).
- **Staff** : +1 pour l'arrivée d'un membre du staff. Ses sorties et réentrées passent par les boutons normaux.
- **Vente** : feuille avec deux cartes, Étudiant et Autre, chacune avec son **prix appliqué** (automatique ou figé, §6.3, **figé à l'ouverture de la feuille**) et un compteur − / + (0 au départ). Total des billets ≤ min(10, V au moment de l'ouverture) ; « + » grisé au plafond. Bouton « Confirmer N billet(s) · X $ » (grisé si N = 0) → **une seule opération** `sale` pour tout le groupe, donc « Annuler dernier » annule le groupe entier.
- **Nouveau prix** : quand les prix appliqués changent, bandeau violet clignotant « NOUVEAU PRIX : X $ · Y $ » pendant 10 s (si les ventes sont ouvertes).
- État du bouton Vente, par ordre de priorité : `FERMÉ` (ventes fermées) › `SUSPENDU` (scans vieux de plus de 60 s, sans forçage) › `COMPLET` (V ≤ 0) › ouvert.
- Âge des scans : ≤ 30 s, rien ; de 30 à 60 s, « ⚠ scans il y a X s » en jaune ; au-delà de 60 s, `SUSPENDU`.
- **Annuler dernier** : actif pendant 30 s après son dernier clic, avec compte à rebours.
- Indicateur réseau : « ● en ligne » ou « ● hors ligne », suivi de « n en attente » (écritures non confirmées).

### 6.2 Tableau de bord (`#/tableau`)

- Chiffre héros : « VOUS POUVEZ VENDRE {V} », ou « COMPLET », ou « SURRÉSERVATION PROJETÉE : {−V} » si V < 0.
- Feu : 🟢 V ≥ 15 · 🟡 1 à 14 · 🔴 V ≤ 0.
- Prix appliqués Étudiant / Autre, avec la mention « Prix automatiques » ou « Prix figés », et « suggéré : X $ · Y $ » quand la suggestion diffère.
- **Alertes (Manager, Admin)** : bouton « Activer le son » dans l'en-tête (le navigateur exige un geste avant de jouer un son). Quand la salle devient pleine, que V tombe à 0 ou que les ventes passent `SUSPENDU` : 3 bips, vibration (Android) et bandeau. Avec le son activé, l'écran reste allumé. Pas de notification système : peu fiable sur une page web, surtout sur iPhone.
- Tuiles : Salle O/C · Billets étudiants S/166 · Billets réguliers S/89 · Dehors · Réserve · Attendus d'ici 1 h · Revenus porte · Âge des scans.
- Bandeaux : alerte de capacité (même règle qu'au §6.1, en premier), `SUSPENDU`, `FERMÉ`, `FORÇAGE ACTIF`, et « ⚠ Hi.Events indique X billets (config : Y) » si un total Hi.Events diffère de T.
- Les valeurs affichées sont arrondies à l'unité ; V est calculé exactement (§9).
- **Version Viewer** : chiffre héros = personnes dans la salle (sur la capacité), tuiles Billets étudiants et Billets réguliers, et alerte de capacité seulement. Aucun V, prix, réserve, revenu ni bandeau de ventes. Bouton « Grand écran » (plein écran quand le navigateur le permet, chiffres agrandis) pour un écran de la sécurité.

### 6.3 Gestion (`#/gestion`)

- Capacité (1 à 300, enregistrée avec Entrée, en quittant le champ ou avec −5/+5) · Ventes ouvertes/fermées · Forcer les ventes malgré des scans périmés.
- **Confirmation obligatoire** avant : fermer les ventes, activer le forçage, monter la capacité au-delà de 255.
- Paramètres : r₀ de départ étudiant et régulier, courbe F(t) de départ (croissante, 100 % à la dernière heure), q de départ. Encadré « Ajusté automatiquement » : retard détecté δ, r̂ étudiant et régulier, q̂, et colonne F ajustée (lecture seule).
- **Prix à la porte** : choix « Automatique » (défaut : prix appliqués = prix suggérés du §9.10, sans action) / « Figé » (prix fixes). Saisie des prix Étudiant et Autre (1 à 100 $) + bouton « Figer ces prix ». Retour à l'automatique en un clic. Les écrans Porte reçoivent chaque changement.
- Calcul de la suggestion : bases (1 à 100 $), paliers (V minimum distincts, multiplicateurs de 0,05 à 5), règle horaire (multiplicateur de 0,05 à 2). Refusé si un prix suggéré pouvait sortir de 1 à 100 $.
- Comptes : le dernier Admin ne peut être ni modifié ni désactivé.
- **Liens de check-in** (Admin) : deux champs (étudiant, régulier), acceptés seulement au format `https://app.hi.events/check-in/cil_…` (option `#scan`). Jamais écrits dans le code.
- Ajustement ±n avec motif : choix « + Ajouter » / « − Retirer », nombre saisi au clavier (1 à 50) et boutons − / +.
- Chaque section de Gestion commence par une courte description d'aide pour la soirée.
- Journal : 50 dernières entrées en direct, bouton Annuler (Manager, Admin).
- Comptes (Admin) : créer (identifiant, nom, rôle, mot de passe), changer le rôle, désactiver.
- « Initialiser l'événement » (Admin, visible seulement si `/events/neon-party` n'existe pas) : écrit les valeurs par défaut du §7.

## 7. Données Firestore

```
/users/{uid}
  username: string · name: string · createdAt: timestamp
  role: "admin" | "manager" | "bouncer" | "viewer" | "disabled"

/events/neon-party                    lisible par tous les comptes actifs (Viewer compris)
  name: "Neon Party" · timezone: "America/Toronto"
  doorsOpen: 2026-09-25T23:00:00Z · end: 2026-09-26T07:00:00Z
  capacity: 255 · salesOpen: true · forceSales: false
  tickets: { student: 166, regular: 89 }

/events/neon-party/private/config     illisible pour le Viewer
  priceMode: "auto" | "locked"        ← "auto" par défaut
  doorPrices: { student: 5, other: 15 } ← utilisés seulement en mode "locked"
  checkinLinks: { student: string, regular: string }  ← liens des pages de check-in Hi.Events ("" = non configuré)
  params:  { r0: { student: 0.75, regular: 0.95 }, q: 0.7, arrivalCurve: [ { t, f }, … ] }
  pricing: { base: { student: 5, other: 15 },
             tiers: [ { min: 30, mult: 1 }, { min: 15, mult: 1.25 }, { min: 5, mult: 1.5 }, { min: 1, mult: 2 } ],
             timeRules: [ { from: 2026-09-26T05:00:00Z, mult: 0.8 } ] }      ← 01:00 heure locale

/events/neon-party/shards/{uid}      un compteur par utilisateur (sans argent)
  staff · saleStudent · saleOther · exit · reentry · adjust : int
  exitW : number · lastOp : string

/events/neon-party/money/{uid}       revenus par utilisateur, illisibles pour Bouncer et Viewer
  revenue : number · lastOp : string

/events/neon-party/log/{opId}        journal immuable
  type: "staff" | "sale" | "exit" | "reentry" | "adjust" | "void"
  uid · at (heure serveur) · clientAt (heure de l'appareil)
  qty?: { student, other }, prices?: { student, other } (ventes) · w? (sorties) · delta?, reason? (ajustements) · ref? (annulations)
```

Courbe d'arrivée par défaut (F = part cumulée des arrivées des détenteurs de billets) :

| Heure locale | 19:00 | 20:00 | 21:00 | 22:00 | 23:00 | 00:00 | 01:00 | 02:00 |
|---|---|---|---|---|---|---|---|---|
| `t` (UTC) | 25 · 23:00 | 26 · 00:00 | 26 · 01:00 | 26 · 02:00 | 26 · 03:00 | 26 · 04:00 | 26 · 05:00 | 26 · 06:00 |
| `f` | 0 | 0,10 | 0,30 | 0,60 | 0,85 | 0,95 | 0,98 | 1 |

Écritures :

- `opId` = `crypto.randomUUID()` ; pour une annulation, `opId = "void_" + ref`.
- **1 action = 1 lot atomique** : création de `log/{opId}` + mise à jour de **son propre** shard (`increment`) avec `lastOp = opId`. Pour une vente (ou l'annulation d'une vente), le lot met aussi à jour **son propre** `money/{uid}` avec le même `lastOp`.
- Le shard et le document `money` sont créés à zéro par leur propriétaire au premier affichage de l'écran Porte, s'ils n'existent pas.

| type | Effet |
|---|---|
| staff | staff +1 |
| sale | saleStudent +qty.student, saleOther +qty.other ; money.revenue + qty.student·prices.student + qty.other·prices.other |
| exit | exit +1, exitW +w, avec w = 2^((clientAt − doorsOpen) / 20 min) |
| reentry | reentry +1 |
| adjust | adjust +delta |
| void | effet inverse de l'opération `ref` |

## 8. Règles de sécurité (exigences)

- Tout est refusé par défaut. « Actif » = rôle admin, manager, bouncer ou viewer, lu dans `/users/{uid}`.
- `users` : chacun lit son propre document ; tout compte actif lit les autres ; seul l'Admin écrit.
- `events/neon-party` : lecture par tout compte actif ; création par l'Admin ; mise à jour par Manager ou Admin, limitée à `capacity` (entier de 1 à 300), `salesOpen` et `forceSales` ; suppression interdite.
- `private/config` : lecture par Admin, Manager et Bouncer (**pas le Viewer**) ; création par l'Admin ; mise à jour par Manager ou Admin, limitée à `priceMode`, `doorPrices` (deux entiers de 1 à 100), `params` et `pricing` ; `checkinLinks` modifiable par l'Admin seulement, chaque valeur vide ou conforme à `^https://app\.hi\.events/check-in/cil_[A-Za-z0-9]+(#scan)?$`.
- `money/{uid}` : lecture par Manager et Admin seulement. Création par le propriétaire à 0. Mise à jour par le propriétaire, dans le même lot qu'un `log` de vente ou d'annulation de vente (`getAfter`), avec une variation égale au montant du log (Σ qty × prices).
- `shards/{uid}` : lecture par tout compte actif. Création par le propriétaire (Admin, Manager ou Bouncer) avec tous les compteurs à 0. Mise à jour par le propriétaire seulement, et seulement si `log/{lastOp}` n'existait pas avant le lot et existe après (`getAfter`), avec des variations qui correspondent exactement au type (tableau du §7). Suppression interdite.
- `log/{opId}` : lecture par Manager et Admin. **Création seulement**, jamais de modification ni de suppression, avec `uid == auth.uid`, `at == request.time`, un type permis par le rôle et `getAfter(shard).lastOp == opId`.
- Validation : `prices` entiers de 1 à 100 · `qty` entiers ≥ 0 avec 1 ≤ qty.student + qty.other ≤ 10 · `w` > 0 et ≤ 2^25 · `delta` entier non nul de −50 à 50, avec `reason` de 1 à 200 caractères.
- Annulation : `opId == "void_" + ref`, et l'original existe et n'est pas lui-même une annulation. Pour un Bouncer, l'original doit être à lui, ne pas être un `adjust`, et `request.time < original.at + 30 s`.
- Les règles **n'imposent pas** V ni `salesOpen` : une vente encaissée hors ligne doit toujours pouvoir être enregistrée.

## 9. Moteur (`computeState`, fonction pure)

Constantes : n₀ = 30 · m₀ = 20 · H = 20 min · z = 1,65 · δ_max = 2 h · scans rafraîchis toutes les 15 s · scans périmés après 60 s.

Auto-ajustement (hypothèse « retard ») : la courbe, r₀ et q saisis ne sont que des valeurs de départ. Des arrivées plus lentes que prévu décalent la courbe (δ) ; des arrivées plus rapides font monter r̂ ; plus de réentrées que prévu font monter q̂. Le moteur ne suppose jamais que des gens ne viendront pas ou ne reviendront pas.

1. **O** = S_étu + S_rég + Σstaff + ΣsaleStudent + ΣsaleOther + Σreentry + Σadjust − Σexit
2. **F₀(t)** : interpolation linéaire de la courbe de départ ; 0 avant le premier point, 1 après le dernier.
   **Retard δ** : cible = min(1, (S_étu + S_rég) / (T_étu·r₀_étu + T_rég·r₀_rég)). Si F₀(now) ≤ cible, δ = 0 ; sinon δ = min(δ_max, now − t*), où t* est le premier instant où F₀(t*) = cible.
   **F** = F₀(now − δ), et F(now + 60 min) = F₀(now + 60 min − δ).
3. Pour chaque type k (étudiant, régulier), avec U_k = max(0, T_k − S_k) :
   - r̂_k = min(1, max(r₀_k, (S_k + n₀·r₀_k) / (T_k·F + n₀)))
   - p_k = 0 si F ≥ 1, sinon r̂_k·(1 − F) / (1 − r̂_k·F)
   - Attendus_k = U_k·p_k · Var_k = U_k·p_k·(1 − p_k)
4. D = max(0, Σexit − Σreentry) · P = ΣexitW · 2^(−(now − doorsOpen) / H) (sorties encore en attente de retour) · Mûres = max(0, Σexit − P)
   **q̂** = min(1, max(q, (Σreentry + m₀·q) / (Mûres + m₀))) · **Retours** = min(D, q̂ · P) · Var_ret = Retours
5. **Marge** = z · √(Var_étu + Var_rég + Var_ret)
6. **Réserve** = Attendus_étu + Attendus_rég + Retours + Marge
7. **V** = ⌊C − O − Réserve⌋ (peut être négatif)
8. **Attendus 1 h** = Σ_k U_k · r̂_k · (F(now + 60 min) − F(now)) / (1 − r̂_k·F(now)), et 0 si F ≥ 1
9. **État des ventes** : FERMÉ si !salesOpen › SUSPENDU si scans > 60 s et !forceSales › COMPLET si V ≤ 0 › OUVERT
10. **Prix suggéré** (si V ≥ 1) : palier = premier `tier` avec V ≥ min ; mult_h = multiplicateur de la règle horaire active, sinon 1 ; prix_k = `Math.round(base_k × palier.mult × mult_h)`
11. **Prix appliqué** : mode `auto` → prix suggéré (s'il n'y en a pas, V ≤ 0 et la vente est déjà `COMPLET`) ; mode `locked` → `doorPrices`.

Scénarios de test obligatoires :

| # | Entrées | Résultat attendu |
|---|---|---|
| E1 | 19:00 · C = 255 · 20 staff · aucun scan, rien d'autre | Réserve 218,86 · **V = 16** · 6 $ / 19 $ · 🟢 |
| E2 | 23:00 · C = 255 · S 100/75 · staff 20 · ventes 20 étu + 5 autre · sorties 25 · réentrées 0 · ΣexitW = 12·2^12 | O = 195 · δ ≈ 3,1 min · Attendus 21,66 + 13,21 · Retours 8,40 · Marge 8,03 · **V = 8** · 8 $ / 23 $ · 🟡 · Attendus 1 h ≈ 23,1 |
| E3 | 01:30 · C = 255 · S 120/85 · staff 20 · ventes 15 étu + 5 autre · sorties 100 · réentrées 60 · ΣexitW = 10·2^19,5 | O = 205 · δ ≈ 28 min · Retours 7 · **V = 33** · 4 $ / 12 $ |
| E4 | Comme E2, avec staff 31 | O = 206 · **V = −3** · COMPLET · surréservation 3 |
| E5 | Scans vieux de 61 s | SUSPENDU ; avec `forceSales` → OUVERT |
| E6 | 02:30 · tous les billets scannés · r₀ = 1 (F = 1, r̂ = 1) | δ = 0, Attendus = 0, aucune division par zéro |
| E7 | S > T | U = 0, aucune valeur négative |
| E8 | 22:00 · aucun scan | δ plafonné à 2 h (courbe lue à 20:00) · r̂ = r₀ |
| E9 | 23:00 · S 150/88 (en avance) | δ = 0 · r̂ étudiant > r₀ |
| E10 | Comme E2 avec sorties 50, réentrées 45, ΣexitW = 2·2^12 | q̂ = (45 + 20·0,7) / (48 + 20) ≈ 0,868 ; avec E2 tel quel, q̂ = q = 0,7 |

Table des prix (à tester) :

| V | Sans règle horaire | Avec ×0,8 (dès 01:00) |
|---|---|---|
| ≥ 30 | 5 $ / 15 $ | 4 $ / 12 $ |
| 15 à 29 | 6 $ / 19 $ | 5 $ / 15 $ |
| 5 à 14 | 8 $ / 23 $ | 6 $ / 18 $ |
| 1 à 4 | 10 $ / 30 $ | 8 $ / 24 $ |
| ≤ 0 | ventes fermées | ventes fermées |

Limite assumée : la protection des détenteurs de billets est de 95 %, pas de 100 %. Le staff compte dans la jauge, donc si tout le monde vient, 255 places ne suffisent pas. Le levier est de monter C vers 300.

## 10. Worker Hi.Events (`capaflow-hievents`)

- Une seule route : `GET /counts`. Tout le reste renvoie 404.
- Secrets Wrangler : `LIST_STUDENT` et `LIST_REGULAR`, les IDs des listes de check-in, fournis par l'utilisateur et **jamais commités**. Variable : `ALLOWED_ORIGIN = https://<compte>.github.io`.
- Appelle en parallèle `https://api.hi.events/public/check-in-lists/{id}` et lit `data.total_attendees` et `data.checked_in_attendees`.
- Garde le résultat en mémoire 10 s.
- Réponse 200 : `{ student: { total, scanned }, regular: { total, scanned }, ageMs }`, avec `Access-Control-Allow-Origin: ALLOWED_ORIGIN` et `Cache-Control: no-store`. En cas d'erreur de Hi.Events : 502.
- Ne renvoie **jamais** de données de participants.
- Côté app : appel toutes les 15 s, avec un délai d'attente de 8 s. Âge des scans = heure de réception − `ageMs`. En cas d'échec, l'app garde la dernière valeur et l'âge continue d'augmenter.
- T reste celui de la configuration (166 / 89). Le `total` renvoyé sert seulement de contrôle (bandeau du §6.2).

## 11. Budget gratuit (6 appareils, ~1 500 actions)

| Service | Limite | Estimation |
|---|---|---|
| Firestore, écritures | 20 000 par jour | ~3 000 |
| Firestore, lectures | 50 000 par jour | ~15 000 |
| Cloudflare Worker | 100 000 par jour | ~11 500 |
| API Hi.Events | 120 par minute | ≤ 12 par minute |

Le quota Firestore se réinitialise à 03:00, heure de l'Est : la journée de vendredi et la soirée partagent un seul quota. **Aucun test sur la base de production le vendredi.** Le développement et les tests se font dans l'émulateur.

## 12. Risques et parades

| Risque | Parade |
|---|---|
| Wi-Fi instable | Données cellulaires ; file d'attente hors ligne de Firestore |
| Worker ou Hi.Events muet plus de 60 s | Ventes `SUSPENDU` automatiquement ; le Manager peut forcer |
| Billet scanné mais personne refusée à l'entrée | Annuler le check-in dans Hi.Events |
| Dérive du comptage | Décompte de la salle, puis ajustement ±n |
| Deux ventes simultanées de la dernière place | 1 ou 2 personnes de trop, absorbées par la marge |
| Panne totale | Compteur manuel + page de check-in Hi.Events |

## 13. Phases et critères d'acceptation

Une phase n'est terminée que si **tous** ses critères passent, preuve à l'appui.

| Phase | Quand | Contenu | Critères d'acceptation |
|---|---|---|---|
| 0 | mar. 22 | **Utilisateur** : projet Firebase Spark (Firestore `northamerica-northeast1`, Auth courriel activé), repo GitHub public `capaflow`, compte Cloudflare, Node LTS, JDK 21, firebase-tools, wrangler. **Claude** : squelette du dépôt (§4) et Worker (§10) | A0.1 `GET /counts` → 200 avec les totaux 166 / 89 · A0.2 CORS = origine de l'app · A0.3 `GET /autre` → 404 · A0.4 aucune donnée de participant dans la réponse |
| 1 | mer. 23 | Auth, rôles, règles, shards, journal, écran Porte, hors ligne | A1.1 Tests des règles : un Viewer ne peut rien écrire ; un Bouncer ne peut pas écrire le shard d'un autre ; lot rejoué refusé ; double annulation refusée ; annulation par un Bouncer après 30 s refusée ; ajustement par un Bouncer refusé ; capacité 301 refusée ; prix de 0 $ ou 101 $ refusé ; `users` modifiable seulement par l'Admin · A1.2 5 clients × 100 actions simultanées → sommes exactes · A1.3 client hors ligne, 50 actions, reconnexion → exactement +50 |
| 2 | mer. 23 | Moteur (§9) | A2.1 E1 à E10 et la table des prix passent · A2.2 tests d'écran : vente mixte (2 étudiants + 1 autre) puis annulation du groupe, quantité plafonnée à V, sortie/réentrée, bandeau « Nouveau prix », capacité validée seulement avec Entrée et confirmée au-delà de 255, fermeture des ventes confirmée, prix invalide refusé, mode figé, dernier Admin protégé |
| 3 | jeu. 24 | Tableau de bord, Gestion, comptes, déploiement sur Pages | A3.1 déploiement par Actions réussi sur `https://<compte>.github.io/capaflow/` · A3.2 création d'un compte sans déconnecter l'Admin · A3.3 l'app s'ouvre hors ligne après un premier chargement |
| 4 | jeu. 24 soir | Répétition sur les vrais téléphones (6 au maximum), comptes créés, événement initialisé | A4.1 Wi-Fi coupé 5 min → aucun doublon ni perte · A4.2 chaque téléphone a ouvert l'app une fois · A4.3 les valeurs affichées correspondent au moteur |
| 5 | ven. 25 | Gel du code, ouverture à 19:00 | Aucun déploiement, sauf correctif bloquant approuvé par l'utilisateur |

## 14. Journal des décisions

| Date | Décision |
|---|---|
| 2026-09-22 | Capacité 255 par défaut, modifiable jusqu'à 300 |
| 2026-09-22 | Staff compté dans le même compteur ; bracelets pour les réentrées |
| 2026-09-22 | 100 % gratuit : GitHub Pages + Firebase Spark + Cloudflare Worker |
| 2026-09-22 | Frontend : React + Vite PWA, thème sombre contrasté, écran Porte à gros boutons, tableau de bord à chiffre héros |
| 2026-09-22 | Entrées avec billet = scan Hi.Events uniquement (aucun clic dans l'app) |
| 2026-09-22 | Ventes à la porte hors Hi.Events (comptant ou terminal) |
| 2026-09-22 | 6 appareils connectés au maximum |
| 2026-09-22 | Taux de présence prudents : 75 % étudiants, 95 % réguliers |
| 2026-09-22 | Nom provisoire : CapaFlow |
| 2026-09-22 | Ordre modifié à la demande de l'utilisateur : **maquette frontend d'abord** (4 écrans du §6 avec données de démonstration issues des scénarios E1–E4, dossier temporaire `app/src/demo/`), pour valider le style avant la phase 0. La démo est retirée en phase 1, quand les vraies données la remplacent |
| 2026-09-22 | Prix à la porte : le moteur **suggère**, le Manager ou l'Admin **applique** (`doorPrices`). Le bouncer ne voit que les prix appliqués |
| 2026-09-22 | Alerte de capacité (O ≥ C) sur les écrans Porte et Tableau |
| 2026-09-22 | Gestion : ajustement saisi au clavier avec choix +/−, et description d'aide pour chaque section |
| 2026-09-22 | Auto-ajustement de la courbe F (retard δ, jusqu'à 2 h) et de r₀ (à la hausse seulement) ; hypothèse « retard » retenue. q et les prix appliqués restent manuels. Aucun historique de scans à stocker |
| 2026-09-22 | Viewer : tableau de bord réduit (salle et billets par type seulement), sans V ni prix |
| 2026-09-22 | Révision du code : capacité validée à l'Entrée, validation des prix et de la courbe, dernier Admin protégé, libellés d'accessibilité uniques |
| 2026-09-22 | **Page web sans installation** : cache hors ligne conservé, pas de manifeste ni d'icônes |
| 2026-09-22 | Blocage réel pour le Viewer : prix et paramètres dans `private/config`, revenus dans `money/{uid}` |
| 2026-09-22 | Confirmations (fermer les ventes, forcer, capacité > 255) ; bandeau « Nouveau prix » ; alertes sonores dans la page (pas de notification système) ; grand écran Viewer |
| 2026-09-22 | Prix **automatiques par défaut** (verrouillables par le Manager) et q̂ appris (à la hausse seulement) |
| 2026-09-22 | Tests d'écran avec Testing Library + jsdom |
| 2026-09-22 | Écran Porte : dates limites d'âge (17 et 18 ans au 25 sept.) et boutons vers les check-ins. Liens saisis par l'Admin dans `private/config` (jamais dans le code public), visibles par Bouncer, Manager et Admin |
| 2026-09-22 | Dates d'âge au format jj/mm/aaaa ; boutons de check-in toujours visibles (grisés tant que non configurés) |
| 2026-09-22 | Vente de plusieurs billets : compteurs Étudiant et Autre dans une même vente, plafond min(10, V) ; type unique `sale` (remplace `sale_student` / `sale_other`) |
| 2026-09-22 | Moteur (§9) et ses tests faits avant la phase 0, pour que la maquette calcule V en direct. Les données restent celles de la démo jusqu'à la phase 1 |
