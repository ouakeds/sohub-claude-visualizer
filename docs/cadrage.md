# Cadrage — sohub-claude-visualizer

## Problème

Les runs Claude Code lancent des agents et des sous-agents dont l'activité et la consommation
ne sont visibles nulle part : ni pendant l'exécution, ni après. Les données existent — chaque
session et chaque sous-agent écrivent un transcript dans `~/.claude/projects/` — mais rien ne
les lit. Il manque un tableau de bord local, transverse aux projets, qui montre qui travaille
sur quoi et ce que ça consomme.

## Utilisateurs et usage réel

- **Le développeur qui lance les runs (utilisateur unique)**
  - *Le geste* : deux moments à parts égales. Pendant qu'un run tourne dans un terminal, il
    ouvre l'écran pour voir où en sont les sous-agents. Une fois le run fini, il l'ouvre pour
    comprendre ce qui a tourné, sur quelle tâche, et ce que ça a coûté en tokens.
  - *Aujourd'hui, sans l'outil* : il n'a pas cette visibilité. Ni pendant, ni après.

## Périmètre v1

### Dans

- **D1 — Écran d'accueil : liste des projets** — un projet par dossier de
  `~/.claude/projects/`, avec son nombre de sessions et sa consommation cumulée, détaillée par
  catégorie de tokens.
  - *Validé par* : `npm start`, ouvrir `http://localhost:4318` : apparaissent les seuls
    dossiers de `~/.claude/projects/` ayant au moins une session dans la fenêtre courante ; un
    dossier sans aucun transcript n'est jamais listé. Chacun porte son chemin réel (lu dans le
    champ `cwd`), son nombre de sessions et ses tokens `input / output / cache read /
    cache creation / thinking`. Au relevé du 2026-09-07 : 7 projets en fenêtre `tout`, 5 en
    fenêtre `7 j`, sur 10 dossiers présents.
- **D2 — Sélecteur de fenêtre temporelle** — `7 j / 30 j / tout`, 7 jours par défaut, appliqué
  à tous les écrans.
  - *Validé par* : passer le sélecteur de `7 j` à `tout` : le nombre de projets et de
    sessions affichés augmente ; revenir à `7 j` le fait redescendre à la valeur initiale. Au
    relevé du 2026-09-07 : de 5 à 7 projets et de 25 à 32 sessions.
- **D3 — Écran projet : liste des sessions** — date, libellé, statut, durée, tokens propres et
  tokens totaux.
  - *Validé par* : cliquer un projet : ses sessions s'affichent, une ligne par fichier
    `<sessionId>.jsonl`, triées par date décroissante.
- **D4 — Écran session : arbre des agents et sous-agents** — repliable, à la profondeur réelle.
  - *Validé par* : ouvrir une session ayant des sous-agents : chaque
    `subagents/agent-<id>.jsonl` apparaît comme un nœud, et les agents d'un workflow apparaissent
    sous un nœud de groupe replié par défaut ; le nœud se replie et se déplie.
    **L'imbrication par `spawnDepth` n'est pas observable sur ces données** : les 38 agents
    relevés le 2026-09-07 sont tous de profondeur 1. La récursivité est écrite, elle ne peut pas
    être constatée tant qu'aucun agent n'en lance un autre.
- **D5 — Détail d'un agent** — type, tâche, modèles, statut, durée, tokens par catégorie, et
  outils appelés avec leur nombre d'appels.
  - *Validé par* : ouvrir le sous-agent `a732a1e499b30b001` de la session `1fe4d7d1…` : on lit
    `agentType: general-purpose`, la tâche « Phase D blueprint Prum », le modèle
    `claude-fable-5`, une durée de 5 min 49 s, et les outils `Read ×8, Skill ×3, Bash ×1,
    Write ×1`.
- **D6 — Statut déduit à trois états** — `terminé`, `en cours`, `inactif` au-delà de 5 minutes
  de silence.
  - *Validé par* : ce même agent s'affiche `terminé` : le `tool_result` de son `toolUseId` est
    présent chez le parent. Un agent dont le transcript n'a pas bougé depuis plus de 5 min et
    sans `tool_result` s'affiche `inactif`, pas `en cours`.
- **D7 — Mise à jour automatique de l'écran** — toutes les ~3 s, par SSE, sans rechargement.
  - *Validé par* : écran ouvert pendant qu'une session Claude Code tourne dans un terminal :
    les compteurs de tokens de cette session bougent seuls en moins de 5 s après chaque
    réponse, sans recharger la page.
- **D8 — Compteur de lignes illisibles** — affiché sur la session concernée.
  - *Validé par* : ajouter une ligne `{ceci n'est pas du json` à la fin d'une copie de
    transcript : la session s'affiche normalement et porte la mention « 1 ligne ignorée ».

### Hors scope

- **Graphiques et courbes** — coupés explicitement : des tableaux chiffrés et triables suffisent
  à la v1.
- **Conversion en dollars** — coupée explicitement, bien que `cost-state.totalCostUSD` soit
  disponible dans les transcripts. La v1 ne parle qu'en tokens.
- **Lecteur du fil complet des messages d'un agent** — la tâche et les outils appelés suffisent
  à savoir sur quoi il est ; rendre des transcripts de 700 Ko est un projet à part.
- **Toute action sur les runs** — lancer, arrêter, relancer. L'outil est en lecture seule
  stricte.
- **Packaging en application de bureau** — un serveur local et un navigateur font le même
  travail sans étape de packaging.
- **Sessions d'autres machines ou du cloud** — seul `~/.claude/projects/` de cette machine est
  lu.

### Hors scope — suggéré, non demandé

- **Export CSV/JSON des agrégats** — `suggéré, non demandé`
- **Alertes et budgets de consommation** — `suggéré, non demandé`

## Critères de validation

| # | Item du périmètre `Dans` | Validé par |
|---|--------------------------|------------|
| 1 | D1 — Liste des projets | `npm start`, ouvrir `http://localhost:4318` : apparaissent les seuls dossiers de `~/.claude/projects/` ayant au moins une session dans la fenêtre courante ; un dossier sans aucun transcript n'est jamais listé. Chacun porte son chemin réel (lu dans le champ `cwd`), son nombre de sessions et ses tokens `input / output / cache read / cache creation / thinking`. Au relevé du 2026-09-07 : 7 projets en fenêtre `tout`, 5 en fenêtre `7 j`, sur 10 dossiers présents |
| 2 | D2 — Sélecteur de fenêtre | Passer le sélecteur de `7 j` à `tout` : le nombre de projets et de sessions affichés augmente ; revenir à `7 j` le fait redescendre à la valeur initiale. Au relevé du 2026-09-07 : de 5 à 7 projets et de 25 à 32 sessions |
| 3 | D3 — Liste des sessions | Cliquer un projet : ses sessions s'affichent, une ligne par fichier `<sessionId>.jsonl`, triées par date décroissante |
| 4 | D4 — Arbre des agents | Ouvrir une session ayant des sous-agents : chaque `subagents/agent-<id>.jsonl` apparaît comme un nœud, et les agents d'un workflow sous un nœud de groupe replié par défaut ; le nœud se replie et se déplie. L'imbrication par `spawnDepth` n'est pas observable : les 38 agents relevés le 2026-09-07 sont tous de profondeur 1 |
| 5 | D5 — Détail d'un agent | Ouvrir le sous-agent `a732a1e499b30b001` de la session `1fe4d7d1…` : on lit `agentType: general-purpose`, la tâche « Phase D blueprint Prum », le modèle `claude-fable-5`, une durée de 5 min 49 s, et les outils `Read ×8, Skill ×3, Bash ×1, Write ×1` |
| 6 | D6 — Statut à trois états | Cet agent s'affiche `terminé` : le `tool_result` de son `toolUseId` est présent chez le parent. Un agent dont le transcript n'a pas bougé depuis plus de 5 min et sans `tool_result` s'affiche `inactif`, pas `en cours` |
| 7 | D7 — Mise à jour automatique | Écran ouvert pendant qu'une session Claude Code tourne dans un terminal : les compteurs de tokens de cette session bougent seuls en moins de 5 s après chaque réponse, sans recharger la page |
| 8 | D8 — Lignes illisibles | Ajouter une ligne `{ceci n'est pas du json` à la fin d'une copie de transcript : la session s'affiche normalement et porte la mention « 1 ligne ignorée » |

## Critères de succès produit

`Non défini à ce stade` — aucun critère d'adoption ou de gain n'a été fixé par l'utilisateur.

## Décisions différées

- **Packaging en application de bureau (Electron ou Tauri)** — à trancher au moment où lancer
  `npm start` depuis un terminal devient pénible à l'usage. Ne bloque aucun item de la v1.
- **Persistance des agrégats sur disque** — à trancher au moment où le scan initial en fenêtre
  `tout` devient trop lent à l'ouverture de l'écran d'accueil. Ne bloque aucun item de la v1.
- **Lecteur du fil de conversation d'un agent** — à trancher au moment où « la tâche + les
  outils appelés » ne suffit plus à comprendre ce qu'a fait un agent. Ne bloque aucun item de
  la v1.
