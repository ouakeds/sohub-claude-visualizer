# sohub-claude-visualizer

Tableau de bord local, en lecture seule, sur les runs Claude Code. Il lit
`~/.claude/projects/` et montre, par projet, les sessions et l'arbre de leurs agents et
sous-agents : leur tâche, leur statut et leur consommation de tokens. Live et analyse à froid.

## Commandes
- Installation : `npm install`
- Build : `npm run build`
- Lancement : `npm start` → `http://localhost:4318`
- Développement : `npm run dev` → Vite sur `5173`, proxy `/api` vers `4318`

## Stack
TypeScript · Node + Express (serveur, SSE) · Vue 3 + Vite (front) · Tailwind CSS · npm

## Arborescence
```
server/    Express : scan, parsing, agrégats, routes REST, flux SSE
web/       Vue 3 : les trois vues (projets, projet, session) et le détail d'un agent
shared/    types partagés serveur/front
docs/      cadrage, architecture, décisions
```

## Règles
- Lecture seule stricte sur `~/.claude/` : aucune écriture, aucun verrou, aucun cache sur
  disque.
- Ne jamais sommer les cinq catégories de `TokenUsage` en un total unique : les afficher côte à
  côte.
- Lire les transcripts avec tolérance : champ absent = zéro, date absente = `null`, type de
  ligne inconnu = ignoré et compté dans `skippedLines`. Aucune exception ne remonte à l'écran.
- Le nom d'un projet vient du champ `cwd` du transcript, jamais du nom du dossier dé-sluggé.
- Aucune dépendance front au-delà de Vue, Vite et Tailwind : ni store, ni routeur — la
  navigation est un état du composable partagé.
- Ne relire un fichier que si son `mtime` a changé.
- Le statut `idle` se libelle « inactif depuis N min », jamais « échoué », et ne déclenche
  aucune action.

## Hors scope
- Graphiques et courbes ; conversion en dollars
- Lecteur du fil complet des messages d'un agent
- Toute action sur les runs (lancer, arrêter, relancer)
- Packaging en application de bureau ; sessions d'autres machines ou du cloud

## Documentation
- [Cadrage](docs/cadrage.md) — besoin, périmètre, critères de validation
- [Architecture](docs/architecture.md) — stack, modules, contrats, arborescence
- [Décisions](docs/decisions.md) — journal des arbitrages
