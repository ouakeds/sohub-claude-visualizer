# sohub-claude-visualizer

Tableau de bord local, en lecture seule, sur vos runs Claude Code. Il lit les transcripts que
Claude Code écrit dans `~/.claude/projects/` et affiche, projet par projet, les sessions et
l'arbre de leurs agents et sous-agents : leur tâche, leur statut et leur consommation de tokens.
Rien n'est envoyé nulle part, rien n'est écrit dans `~/.claude/` : le serveur tourne sur votre
machine et se contente de lire des fichiers que vous avez déjà.

## Sommaire

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Configuration](#configuration)
- [État du projet](#état-du-projet)
- [Documentation](#documentation)

## Prérequis

- **Node.js** — développé et vérifié sur `v25.9.0`.
- **npm** — vérifié sur `11.12.1`.
- **Claude Code** installé et déjà utilisé au moins une fois : l'outil n'affiche que ce qu'il
  trouve dans `~/.claude/projects/`. Sur une machine où ce dossier est absent ou vide, l'écran
  s'affiche correctement mais la liste est vide.

## Installation

```bash
git clone <url-du-dépôt> sohub-claude-visualizer
cd sohub-claude-visualizer
npm install
```

Aucune variable d'environnement, aucun fichier de configuration à créer, aucune base de données
à provisionner : l'outil lit directement le dossier de Claude Code.

## Usage

**Consultation** — construire le front et lancer le serveur :

```bash
npm run build
npm start
```

Puis ouvrir <http://localhost:4318>. L'écran d'accueil liste vos projets avec, pour chacun :

- son nom et son chemin réel sur le disque ;
- le nombre de sessions ;
- cinq colonnes de tokens — `input`, `output`, `cache lu`, `cache créé`, `thinking`. Elles ne
  sont **jamais** additionnées en un total unique : sur un run réel, le cache lu écrase les
  quatre autres d'un facteur mille et un total n'apprendrait rien ;
- la date de dernière activité ;
- le cas échéant, la mention « N lignes ignorées », qui signale que la lecture d'un transcript
  a été partielle.

Le sélecteur en haut à droite filtre sur **7 j / 30 j / tout**, 7 jours par défaut. Un projet
sans session dans la fenêtre choisie disparaît de la liste et réapparaît sur une fenêtre plus
large ; un dossier ne contenant aucun transcript n'est jamais listé.

**Développement** — recharge à chaud du front :

```bash
npm start      # dans un terminal : l'API sur 4318
npm run dev    # dans un autre : Vite sur 5173, avec proxy de /api vers 4318
```

L'interface de développement est alors sur <http://localhost:5173>.

## API

Le serveur expose une API de lecture seule, utile aussi en ligne de commande.

`GET /api/projects?window=7d|30d|all` — la liste des projets de la fenêtre, triée par activité
décroissante. Une valeur absente ou invalide retombe sur `7d`.

```bash
curl -s 'http://localhost:4318/api/projects?window=all'
```

```json
[
  {
    "id": "-Users-sabriouaked-Desktop-projets-ai-sohub-claude-plugins",
    "path": "/Users/sabriouaked/Desktop/projets/ai/sohub-claude-plugins",
    "name": "sohub-claude-plugins",
    "sessionCount": 7,
    "usage": {
      "input": 1296,
      "output": 842479,
      "cacheRead": 54943590,
      "cacheCreation": 1584055,
      "thinking": 331779
    },
    "lastActivity": "2026-09-07T14:16:20.521Z",
    "skippedLines": 0
  }
]
```

Les formes de données échangées sont définies une seule fois dans `shared/types.ts`, importé
par le serveur comme par le front.

## Configuration

Tout est en dur et versionné, dans `server/src/config.ts` :

| Réglage | Valeur | Effet |
|---|---|---|
| `PORT` | `4318` | port du serveur ; à changer ici s'il est déjà occupé |
| `PROJECTS_ROOT` | `~/.claude/projects` | dossier lu, en lecture seule |
| `DEFAULT_WINDOW` | `7d` | fenêtre appliquée quand aucune n'est demandée |

Le port du serveur de développement Vite (`5173`) et son proxy vers l'API sont dans
`web/vite.config.ts`. Les deux doivent rester cohérents si vous changez `PORT`.

## État du projet

**Actif, en cours de construction.** Ce qui fonctionne aujourd'hui : l'écran d'accueil, la liste
des projets avec leur consommation, et le sélecteur de fenêtre. Ce qui est cadré mais pas encore
construit : la liste des sessions d'un projet, l'arbre des agents et sous-agents avec leur
tâche et leur statut, et la mise à jour automatique de l'écran pendant qu'un run tourne.

Le périmètre complet de la v1, et ce qui en est explicitement exclu, sont dans
[docs/cadrage.md](docs/cadrage.md).

## Documentation

- [Cadrage](docs/cadrage.md) — le besoin, le périmètre, les critères de validation
- [Architecture](docs/architecture.md) — la stack, les modules, les contrats, l'arborescence
- [Décisions](docs/decisions.md) — le journal des arbitrages et de leurs raisons
- [CLAUDE.md](CLAUDE.md) — les règles de travail pour les agents intervenant sur ce dépôt
